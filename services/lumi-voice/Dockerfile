FROM python:3.12-slim-bookworm

# CPU is the default. A CUDA wheel index requires a compatible host GPU/runtime.
ARG PYTORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_DATASETS_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    QWEN_TTS_HOST=0.0.0.0 \
    QWEN_TTS_PORT=8766 \
    QWEN_TTS_DEVICE=cpu \
    QWEN_TTS_MODEL_DIR=/data/models/base \
    QWEN_TTS_REFERENCE_DIR=/data/voices/lumi \
    QWEN_TTS_CACHE_DIR=/data/cache/prepared

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libsndfile1 libgomp1 sox \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 lumi \
    && useradd --create-home --uid 10001 --gid 10001 --shell /usr/sbin/nologin lumi \
    && mkdir -p /data/models /data/voices /data/cache \
    && chown -R lumi:lumi /data

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir torch==2.10.0 torchaudio==2.10.0 --index-url "${PYTORCH_INDEX_URL}" \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY server.py synthesis.py audio_store.py preparation.py healthcheck.py ./

USER lumi
EXPOSE 8766
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 CMD ["python", "healthcheck.py"]
CMD ["python", "server.py"]
