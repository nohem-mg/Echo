# Build context is backend/ (see docker-compose.yml). The gateway is the only
# public backend surface: it bridges the CRE contract to the internal services.
FROM oven/bun:1-alpine

WORKDIR /srv

# Manifest first for layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY dev-gateway ./dev-gateway

EXPOSE 8080
CMD ["bun", "run", "dev-gateway/server.ts"]
