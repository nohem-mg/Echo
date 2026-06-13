# Build context is backend/ (see docker-compose.yml) to pull in echo-common.
# No ML/native deps — pure Python — so any modern Python works.
FROM python:3.12-slim

WORKDIR /srv

# Shared package first (changes rarely → better layer caching).
COPY packages/echo-common /pkg/echo-common
RUN pip install --no-cache-dir /pkg/echo-common

COPY services/registry-service/pyproject.toml ./
RUN pip install --no-cache-dir .

COPY services/registry-service/app ./app

EXPOSE 8004
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8004"]
