# Build context is backend/ (see docker-compose.yml) to pull in echo-common.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY packages/echo-common /pkg/echo-common
RUN pip install --no-cache-dir /pkg/echo-common

COPY services/report-service/pyproject.toml ./
RUN pip install --no-cache-dir .

COPY services/report-service/app ./app

EXPOSE 8005
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8005"]
