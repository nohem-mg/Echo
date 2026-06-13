# Python 3.11 : seule version où basic-pitch s'installe partout (sur macOS, le
# marqueur tensorflow-macos<2.15.1 bloque 3.12+ ; voir README).
FROM python:3.11-slim

# libsndfile + ffmpeg : décodage audio (wav/flac via soundfile, mp3/m4a via ffmpeg).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY app ./app

EXPOSE 8001
ENV ECHO_BP_HOST=0.0.0.0 ECHO_BP_PORT=8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
