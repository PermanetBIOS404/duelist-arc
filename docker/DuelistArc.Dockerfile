FROM node:20-bookworm-slim AS app

WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY src ./src
COPY index.html card.html README.md ./  # small top-level assets
COPY server/src ./server/src
COPY server/data ./server/data
COPY server/db ./server/db

ENV PORT=8787
EXPOSE 8787

CMD ["node", "server/src/index.js"]

# --- Optional duel core bundle (for "Browser CPU" demo mode) ------------------
# Build the `bundled` target to vendor EDOpro-server-ts + CoreIntegrator into the
# Duelist ARC image (no separate host checkout needed).
#
# Example:
#   docker build -f docker/DuelistArc.Dockerfile --target bundled \
#     --build-arg EDOPRO_REF=... -t duelist-arc:bundled .
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
  && bash build_core_integrator.sh

# Make the bundled core visible to Duelist ARC.
ENV EDOPRO_SERVER_TS_ROOT=/opt/edopro/repo
