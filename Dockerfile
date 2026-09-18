# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 WRANGLER_SEND_METRICS=false
COPY package.json package-lock.json ./
COPY apps/plataforma/package.json ./apps/plataforma/package.json
RUN npm ci
COPY apps/plataforma ./apps/plataforma
RUN npm run build:node

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 \
    AUDIO_STORAGE_DIR=/data/recordings NEXT_TELEMETRY_DISABLED=1
# vinext is a runtime server dependency as well as the build tool.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/plataforma/package.json ./apps/plataforma/package.json
COPY --from=build /app/apps/plataforma/dist ./apps/plataforma/dist
COPY --from=build /app/apps/plataforma/scripts ./apps/plataforma/scripts
# Catalog and shared validation are used by the private voice:prepare CLI.
COPY --from=build /app/apps/plataforma/lib ./apps/plataforma/lib
COPY --from=build /app/apps/plataforma/postgres ./apps/plataforma/postgres
RUN mkdir -p /data/recordings /app/apps/plataforma/work && \
    chown -R node:node /data /app/apps/plataforma/work
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/plataforma/scripts/start-node.mjs"]
