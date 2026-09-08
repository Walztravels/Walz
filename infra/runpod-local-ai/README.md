# Walz Orbit — Local AI GPU service (RunPod)

Implements the Creative OS `LOCAL` lane contract
(`lib/orbit/creative-os/local-adapter.ts`). One pod = one GPU worker;
jobs are async and serialized.

## Deploy (RunPod)

1. **Create the pod** from the official **PyTorch** template
   (Console → Pods → Deploy → template "PyTorch", or via the RunPod
   plugin/`runpodctl` in a Claude Code session). Recommended GPU:
   **RTX 4090 (24GB)** — covers SDXL + rembg + vectorize; enables SVD video.
   Cheaper option: RTX A4000/3090 with `ENABLE_SVD=false`.
   - Expose **HTTP port 8000**
   - Volume: ≥ 40GB at `/workspace` (model cache survives restarts)

2. **Environment variables on the pod:**
   - `ORBIT_LOCAL_AI_TOKEN` — generate a long random string
   - `PUBLIC_BASE_URL`      — `https://<podId>-8000.proxy.runpod.net`
   - `ENABLE_SVD`           — `true` on 24GB GPUs for image-to-video
   - `HF_HOME=/workspace/hf` — cache SDXL weights on the volume

3. **Install the service** (pod web terminal or SSH):
   ```bash
   mkdir -p /workspace/walz-local-ai && cd /workspace/walz-local-ai
   # copy app.py + start.sh here (git clone the repo, or paste the two files)
   bash start.sh
   ```
   First run downloads SDXL (~7GB) into the volume cache.

4. **Verify:**
   ```bash
   curl -s -H "Authorization: Bearer $ORBIT_LOCAL_AI_TOKEN" \
     "$PUBLIC_BASE_URL/api/v1/health"
   # → {"ok":true,...}
   ```

5. **Wire into Vercel** (project → Settings → Environment Variables):
   - `ORBIT_LOCAL_AI_URL`   = the `PUBLIC_BASE_URL` value
   - `ORBIT_LOCAL_AI_TOKEN` = the same token
   Redeploy — the Creative OS `LOCAL` lane and `LOCAL_ONLY` mode go live,
   and `/admin/orbit/creative-os` shows "Local AI: online".

## Capabilities (v1)

| Endpoint    | Backing                                | Notes |
|-------------|----------------------------------------|-------|
| `sdxl`      | SDXL base 1.0 (diffusers, fp16)        | text→image |
| `img2img`   | SDXL img2img                           | |
| `inpaint`   | SDXL inpaint                           | optional `mask_url` |
| `rembg`     | rembg (onnxruntime-gpu)                | transparent PNG |
| `vectorize` | vtracer                                | real SVG export |
| `upscale`   | 4× Lanczos + unsharp (model-free)      | swap for ESRGAN later |
| `img2vid`   | Stable Video Diffusion XT              | `ENABLE_SVD=true`, 24GB |
| `txt2vid`   | 501 — cloud lanes cover it             | |

## Cost note

A 4090 community pod ≈ $0.34–0.45/hr. Stop the pod when idle — the
router degrades gracefully (LOCAL lane shows unavailable; STANDARD and
PREMIUM cloud lanes keep working). The volume keeps model caches so
restarts are fast.
