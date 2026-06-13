# Build context is backend/ (see docker-compose.yml) so we can pull in the
# sibling echo-common package. Python 3.11: only version where basic-pitch
# installs everywhere (on macOS the tensorflow-macos<2.15.1 marker blocks 3.12+).
FROM python:3.11-slim

# libsndfile + ffmpeg: audio decoding (wav/flac via soundfile, mp3/m4a via ffmpeg).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

# Shared package first (changes rarely → better layer caching).
COPY packages/echo-common /pkg/echo-common
RUN pip install --no-cache-dir /pkg/echo-common

COPY services/basic-pitch-service/pyproject.toml ./
RUN pip install --no-cache-dir .

COPY services/basic-pitch-service/app ./app

EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
