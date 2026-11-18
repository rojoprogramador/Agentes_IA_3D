# Motor de Agentes IA 3D en un contenedor (fase C9), para correrlo 24/7 en un servidor (VPS).
# Se construye desde la raíz del repositorio (necesita motor/ y roles/):  docker compose build
# Guía completa: docs/vps.md
FROM node:24-bookworm-slim

# Chromium (PDF, vista previa, auditorías web), git (skills y análisis de repos), fuentes para los PDF y
# cloudflared (túnel de WhatsApp y alertas). ffmpeg viene en las dependencias de npm (ffmpeg-static).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-noto-color-emoji git ca-certificates curl tini \
  && ARCH=$(dpkg --print-architecture) \
  && curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" \
  && dpkg -i /tmp/cloudflared.deb && rm /tmp/cloudflared.deb \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production CHROME_PATH=/usr/bin/chromium PUPPETEER_SKIP_DOWNLOAD=1
WORKDIR /app

# Dependencias primero (capa en caché mientras no cambie package.json)
COPY motor/package.json motor/
RUN cd motor && npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY roles/ roles/
COPY motor/ motor/

# Carpetas de datos (se montan como volúmenes) y usuario sin privilegios
RUN mkdir -p motor/logs motor/trabajos motor/entregas motor/.claude/skills motor/skills-clientes motor/skills-archivo /home/node/.claude \
  && chown -R node:node /app /home/node
USER node
WORKDIR /app/motor

# tini reenvía Ctrl+C / docker stop al motor para que se apague ordenado
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "worker.mjs"]
