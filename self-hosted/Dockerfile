FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:selfhost
RUN mkdir -p /data /backups && chown -R node:node /data /backups /app
USER node
ENV NODE_ENV=production VERGE_DATA_DIR=/data VERGE_BACKUP_DIR=/backups VERGE_BIND=0.0.0.0 PORT=3000 VERGE_ORIGIN=https://vergecommon.com VERGE_TRUST_CADDY=1
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 CMD ["node", "self-hosted/healthcheck.mjs"]
CMD ["node", "self-hosted/server.mjs"]
