"""
Walz Orbit — Local AI GPU service (RunPod pod).

Implements the Creative OS local-adapter contract:
  POST /api/v1/{sdxl|img2img|inpaint|upscale|rembg|vectorize|img2vid|txt2vid}
       -> { "job_id": str }              (Bearer auth, async)
  GET  /api/v1/jobs/{job_id}            -> { status, output_url?, error? }
  GET  /api/v1/health                   -> { ok: true }

Design: single-process FastAPI + one worker thread (GPU jobs are serialized —
a pod has one GPU). Outputs are written to OUTPUT_DIR and served statically;
output_url uses PUBLIC_BASE_URL (the pod's RunPod proxy URL).

v1 capability notes (honest):
  sdxl / img2img / inpaint : Stable Diffusion XL via diffusers (GPU)
  rembg                    : rembg (BiRefNet-lite/u2net, onnxruntime)
  vectorize                : vtracer (CPU, fast, real SVG)
  upscale                  : 4x Lanczos + unsharp (deterministic, model-free v1)
  img2vid                  : Stable Video Diffusion (GPU, ENABLE_SVD=true; needs ~20GB VRAM)
  txt2vid                  : 501 in v1 (router treats as unavailable; cloud lanes cover it)

Env:
  ORBIT_LOCAL_AI_TOKEN  (required)  bearer token — must match Vercel's value
  PUBLIC_BASE_URL       (required)  e.g. https://<podId>-8000.proxy.runpod.net
  OUTPUT_DIR            default /workspace/outputs
  ENABLE_SVD            default false
"""

import os, io, uuid, time, threading, queue, traceback
from typing import Optional

import requests as http
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageFilter

TOKEN       = os.environ.get("ORBIT_LOCAL_AI_TOKEN", "")
# Auto-derive the RunPod proxy URL when PUBLIC_BASE_URL isn't set explicitly
BASE_URL    = (os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
               or (f"https://{os.environ['RUNPOD_POD_ID']}-8000.proxy.runpod.net"
                   if os.environ.get("RUNPOD_POD_ID") else ""))
OUTPUT_DIR  = os.environ.get("OUTPUT_DIR", "/workspace/outputs")
ENABLE_SVD  = os.environ.get("ENABLE_SVD", "false").lower() == "true"

MAX_JSON_BYTES  = 1_000_000        # request bodies are JSON descriptors only
MAX_IMAGE_BYTES = 30_000_000       # fetched source assets
RATE_LIMIT_PER_MIN = 30            # generation submissions per minute

# Model registry with license metadata — recorded on every job.
# Licenses verified for Walz commercial use; caveats noted explicitly.
MODELS = {
    "sdxl":      {"name": "stabilityai/stable-diffusion-xl-base-1.0", "source": "huggingface",
                  "license": "CreativeML Open RAIL++-M (commercial use permitted, use restrictions apply)"},
    "svd":       {"name": "stabilityai/stable-video-diffusion-img2vid-xt", "source": "huggingface",
                  "license": "Stability AI Community License (commercial use permitted for orgs under $1M annual revenue)"},
    "rembg":     {"name": "u2net (rembg)", "source": "github.com/danielgatis/rembg",
                  "license": "MIT (rembg) / Apache-2.0 (U-2-Net weights)"},
    "vectorize": {"name": "vtracer", "source": "github.com/visioncortex/vtracer", "license": "GPL-3.0 (binary use as a service; no code distribution)"},
    "upscale":   {"name": "Lanczos4x+unsharp (model-free)", "source": "Pillow", "license": "HPND (Pillow)"},
}

os.makedirs(OUTPUT_DIR, exist_ok=True)

app = FastAPI(title="Walz Orbit Local AI", docs_url=None, redoc_url=None)
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")

# ── Rate limiting (per-minute token bucket, single-tenant service) ────────────
_rl_window: list[float] = []

def check_rate_limit() -> None:
    now = time.time()
    while _rl_window and now - _rl_window[0] > 60:
        _rl_window.pop(0)
    if len(_rl_window) >= RATE_LIMIT_PER_MIN:
        raise HTTPException(429, "rate limit exceeded")
    _rl_window.append(now)

# ── Auth ──────────────────────────────────────────────────────────────────────

def check_auth(request: Request) -> None:
    if not TOKEN:
        raise HTTPException(500, "ORBIT_LOCAL_AI_TOKEN not configured on the pod")
    auth = request.headers.get("authorization", "")
    if auth != f"Bearer {TOKEN}":
        raise HTTPException(401, "unauthorized")

# ── Job store + single GPU worker ─────────────────────────────────────────────

JOBS: dict[str, dict] = {}
WORK: "queue.Queue[str]" = queue.Queue()

def submit(endpoint: str, payload: dict) -> str:
    job_id = uuid.uuid4().hex
    model_key = {"sdxl": "sdxl", "img2img": "sdxl", "inpaint": "sdxl", "img2vid": "svd"}.get(endpoint, endpoint)
    JOBS[job_id] = {"status": "queued", "endpoint": endpoint, "payload": payload,
                    "created": time.time(), "output_url": None, "error": None,
                    "model": MODELS.get(model_key, {})}
    WORK.put(job_id)
    return job_id

def out_url(filename: str) -> str:
    return f"{BASE_URL}/outputs/{filename}"

def save_image(img: Image.Image, ext: str = "png") -> str:
    name = f"{uuid.uuid4().hex}.{ext}"
    img.save(os.path.join(OUTPUT_DIR, name))
    return out_url(name)

def fetch_image(url: str) -> Image.Image:
    # Source-asset validation: scheme, MIME type, size cap
    if not url.startswith(("https://", "http://")):
        raise RuntimeError("image_url must be http(s)")
    r = http.get(url, timeout=60, stream=True)
    r.raise_for_status()
    ctype = r.headers.get("content-type", "")
    if not ctype.startswith("image/"):
        raise RuntimeError(f"source is not an image (content-type {ctype})")
    data = b""
    for chunk in r.iter_content(65536):
        data += chunk
        if len(data) > MAX_IMAGE_BYTES:
            raise RuntimeError("source image exceeds 30MB limit")
    return Image.open(io.BytesIO(data)).convert("RGB")

# Lazy model holders — loaded on first use, kept resident
_models: dict = {}

def get_sdxl(kind: str):
    import torch
    from diffusers import (StableDiffusionXLPipeline, StableDiffusionXLImg2ImgPipeline,
                           StableDiffusionXLInpaintPipeline)
    key = f"sdxl_{kind}"
    if key not in _models:
        cls = {"txt": StableDiffusionXLPipeline, "img": StableDiffusionXLImg2ImgPipeline,
               "inpaint": StableDiffusionXLInpaintPipeline}[kind]
        pipe = cls.from_pretrained("stabilityai/stable-diffusion-xl-base-1.0",
                                   torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
        pipe.to("cuda")
        _models[key] = pipe
    return _models[key]

def size_for(aspect: str) -> tuple[int, int]:
    return {"9:16": (768, 1344), "16:9": (1344, 768), "4:5": (896, 1120)}.get(aspect, (1024, 1024))

def run_job(job_id: str) -> None:
    job = JOBS[job_id]
    job["status"] = "processing"
    p = job["payload"]
    ep = job["endpoint"]
    try:
        if ep == "sdxl":
            w, h = size_for(p.get("aspect_ratio", "1:1"))
            img = get_sdxl("txt")(prompt=p["prompt"], width=w, height=h,
                                  num_inference_steps=28).images[0]
            job["output_url"] = save_image(img)

        elif ep == "img2img":
            base = fetch_image(p["image_url"])
            img = get_sdxl("img")(prompt=p.get("prompt", ""), image=base,
                                  strength=float(p.get("strength", 0.6)),
                                  num_inference_steps=28).images[0]
            job["output_url"] = save_image(img)

        elif ep == "inpaint":
            base = fetch_image(p["image_url"])
            mask = fetch_image(p["mask_url"]) if p.get("mask_url") else Image.new("RGB", base.size, "white")
            img = get_sdxl("inpaint")(prompt=p.get("prompt", ""), image=base, mask_image=mask,
                                      num_inference_steps=28).images[0]
            job["output_url"] = save_image(img)

        elif ep == "rembg":
            from rembg import remove
            base = fetch_image(p["image_url"])
            cut = remove(base)
            job["output_url"] = save_image(cut, "png")

        elif ep == "vectorize":
            import vtracer
            r = http.get(p["image_url"], timeout=60); r.raise_for_status()
            name = f"{uuid.uuid4().hex}.svg"
            src = os.path.join(OUTPUT_DIR, f"{uuid.uuid4().hex}.png")
            with open(src, "wb") as f: f.write(r.content)
            vtracer.convert_image_to_svg_py(src, os.path.join(OUTPUT_DIR, name))
            os.unlink(src)
            job["output_url"] = out_url(name)

        elif ep == "upscale":
            base = fetch_image(p["image_url"])
            up = base.resize((base.width * 4, base.height * 4), Image.LANCZOS)
            up = up.filter(ImageFilter.UnsharpMask(radius=2, percent=110, threshold=2))
            job["output_url"] = save_image(up)

        elif ep == "img2vid":
            if not ENABLE_SVD:
                raise RuntimeError("SVD disabled — set ENABLE_SVD=true (needs ~20GB VRAM)")
            import torch
            from diffusers import StableVideoDiffusionPipeline
            from diffusers.utils import export_to_video
            if "svd" not in _models:
                pipe = StableVideoDiffusionPipeline.from_pretrained(
                    "stabilityai/stable-video-diffusion-img2vid-xt",
                    torch_dtype=torch.float16, variant="fp16")
                pipe.to("cuda")
                _models["svd"] = pipe
            base = fetch_image(p["image_url"]).resize((1024, 576))
            frames = _models["svd"](base, num_frames=25, decode_chunk_size=4).frames[0]
            name = f"{uuid.uuid4().hex}.mp4"
            export_to_video(frames, os.path.join(OUTPUT_DIR, name), fps=7)
            job["output_url"] = out_url(name)

        else:
            raise RuntimeError(f"unknown endpoint {ep}")

        job["status"] = "completed"
    except Exception as e:  # noqa: BLE001 — job errors are reported, never crash the worker
        traceback.print_exc()
        job["status"] = "failed"
        job["error"] = str(e)[:400]

def worker() -> None:
    while True:
        run_job(WORK.get())

threading.Thread(target=worker, daemon=True).start()

# ── Routes ────────────────────────────────────────────────────────────────────

CAPABILITIES = {"sdxl", "img2img", "inpaint", "upscale", "rembg", "vectorize", "img2vid"}

@app.get("/api/v1/health")
def health():
    caps = sorted(CAPABILITIES - ({"img2vid"} if not ENABLE_SVD else set()))
    return {"ok": True, "queued": WORK.qsize(), "svd": ENABLE_SVD, "capabilities": caps}

@app.get("/api/v1/models")
def models(request: Request):
    check_auth(request)
    return {"models": MODELS}

@app.post("/api/v1/{endpoint}")
async def create_job(endpoint: str, request: Request):
    check_auth(request)
    check_rate_limit()
    if endpoint == "txt2vid":
        raise HTTPException(501, "txt2vid not available in local v1 — use a cloud lane")
    if endpoint not in CAPABILITIES:
        raise HTTPException(404, f"unknown capability {endpoint}")
    if int(request.headers.get("content-length") or 0) > MAX_JSON_BYTES:
        raise HTTPException(413, "request body too large")
    payload = await request.json()
    if endpoint in {"img2img", "inpaint", "rembg", "vectorize", "upscale", "img2vid"} and not payload.get("image_url"):
        raise HTTPException(400, "image_url required")
    if endpoint == "sdxl" and not payload.get("prompt"):
        raise HTTPException(400, "prompt required")
    return {"job_id": submit(endpoint, payload)}

@app.get("/api/v1/jobs/{job_id}")
def job_status(job_id: str, request: Request):
    check_auth(request)
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return {"status": job["status"], "output_url": job["output_url"],
            "error": job["error"], "model": job.get("model", {})}
