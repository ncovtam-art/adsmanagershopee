FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
WORKDIR /workspace/adsmanagershopee
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca,mode=0444 \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; export NODE_USE_ENV_PROXY=1; fi; npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts --no-audit

FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS runtime
RUN --mount=type=secret,id=build_ca,mode=0444 \
    sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && \
    if [ -f /run/secrets/build_ca ]; then apt-get -o Acquire::https::CaInfo=/run/secrets/build_ca update && apt-get -o Acquire::https::CaInfo=/run/secrets/build_ca install -y --no-install-recommends ffmpeg ca-certificates; else apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates; fi && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /workspace/adsmanagershopee
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Locked production dependencies include the TSX worker runtime; build tools are pruned.
COPY --from=build --chown=node:node /workspace/adsmanagershopee ./
RUN mkdir -p .cache/video-storage && chown -R node:node .cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm","start"]
