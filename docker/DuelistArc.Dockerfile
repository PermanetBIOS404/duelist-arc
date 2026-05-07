FROM node:20-bookworm-slim AS app

WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY src ./src
COPY index.html card.html README.md ./
COPY server/src ./server/src
COPY server/data ./server/data
COPY server/db ./server/db

ENV PORT=8787
EXPOSE 8787

CMD ["node", "server/src/index.js"]

# --- Full-stack bundle for Render single-service deployment -------------------
# This target vendors EDOpro-server-ts + CoreIntegrator into the Duelist ARC image
# and starts both the internal EDOPro service and the public Duelist ARC server.
FROM app AS bundled

ARG EDOPRO_REPO="https://github.com/diangogav/EDOpro-server-ts.git"
ARG EDOPRO_REF="main"

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    git curl wget \
    g++ make cmake pkg-config \
    libboost-system-dev \
    libsqlite3-dev \
    libjsoncpp-dev \
    nlohmann-json3-dev \
    libcurl4-openssl-dev \
    liblua5.3-dev \
    libevent-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/edopro
RUN git clone --recursive --depth 1 --branch "${EDOPRO_REF}" "${EDOPRO_REPO}" repo

WORKDIR /opt/edopro/repo
RUN bash clone_repositories.sh \
  && bash setup_resources.sh \
  && bash build_core_integrator.sh \
  && npm ci --omit=dev

COPY docker/start-full-stack.sh /usr/local/bin/start-full-stack.sh
RUN chmod +x /usr/local/bin/start-full-stack.sh

ENV EDOPRO_SERVER_TS_ROOT=/opt/edopro/repo
ENV EDOPRO_HTTP_URL=http://127.0.0.1:7922
ENV EDOPRO_HOST=127.0.0.1
ENV EDOPRO_PORT=7911
ENV HOST_PORT=7911
ENV HTTP_PORT=7922
ENV WEBSOCKET_PORT=4000
ENV EDOPRO_NODE_ENV=production

EXPOSE 8787 7911 7922 4000

CMD ["/usr/local/bin/start-full-stack.sh"]

# --- Render default final image ------------------------------------------------
# Render does not expose a Docker build target field here, so this final stage
# makes the full-stack bundled image the default deployed image.
FROM bundled AS final
