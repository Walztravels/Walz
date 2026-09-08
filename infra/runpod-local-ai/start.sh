#!/usr/bin/env bash
# Walz Orbit Local AI — bootstrap on a RunPod official PyTorch pod.
# Idempotent: safe to re-run; use as the pod's Container Start Command via
#   bash -c "cd /workspace/walz-local-ai && bash start.sh"
set -euo pipefail

cd "$(dirname "$0")"

echo "[walz-local-ai] installing deps…"
pip install --quiet --no-input \
  fastapi "uvicorn[standard]" requests pillow \
  diffusers transformers accelerate safetensors \
  "rembg[gpu]" vtracer

: "${ORBIT_LOCAL_AI_TOKEN:?Set ORBIT_LOCAL_AI_TOKEN in the pod's environment}"
# PUBLIC_BASE_URL auto-derives from RUNPOD_POD_ID inside app.py when unset

echo "[walz-local-ai] starting on :8000 (SVD=${ENABLE_SVD:-false})"
exec uvicorn app:app --host 0.0.0.0 --port 8000
