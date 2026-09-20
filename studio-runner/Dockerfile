# syntax=docker/dockerfile:1
#
# studio-runner image (ADR-001 §8).
#
# The base image tag MUST equal the exact `playwright` version pinned in package.json.
# Browsers are provided by the image; the npm postinstall never downloads them.
# REGISTRY defaults to the public Playwright registry, which ADR-001 permits for local
# development only. Production builds pass the internal registry (ED-05).

ARG PLAYWRIGHT_VERSION=1.63.0
ARG REGISTRY=mcr.microsoft.com
ARG PLAYWRIGHT_DISTRO=noble
# Full tag of the image being built, e.g. registry.citi.com/put/checks-studio-runner:0.1.0-abc1234.
# CI passes it (`ci/stages.md` stage 7); it is recorded as `image` in runtime-versions.json and is
# null on a local build, which `check:pins` reports as NOT ASSERTED rather than as a pass (AC-3).
ARG IMAGE_TAG=

FROM ${REGISTRY}/playwright:v${PLAYWRIGHT_VERSION}-${PLAYWRIGHT_DISTRO} AS build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ARG IMAGE_TAG
# Exported so `scripts/write-runtime-versions.mjs` can read the build arg from the environment.
# PLAYWRIGHT_BROWSERS_PATH is inherited from the base image and gives the script the Chromium
# build revision that ships with this exact Playwright version.
ENV IMAGE_TAG=${IMAGE_TAG}
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
# `scripts/write-runtime-versions.mjs` reads the image copy of the pin out of this Dockerfile and
# the Node major out of .nvmrc, so both have to be in the build context (ADR-001 §4.2: the recorded
# copy must come from the same file `check:pins` compares, not from a restated build arg).
COPY Dockerfile .nvmrc ./
RUN npm run build

FROM ${REGISTRY}/playwright:v${PLAYWRIGHT_VERSION}-${PLAYWRIGHT_DISTRO} AS runtime
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# The official Playwright image defaults to root, which disables the Chromium sandbox.
# ADR-001 §8 and architecture §9.3 require a non-root user with a writable home.
# The sandbox is never disabled to make the image run; `--no-sandbox` must not be added.
USER pwuser
ENV HOME=/home/pwuser

# Entry point (story 10.6). `dist/main.js` loads configuration, starts the internal HTTP server
# and drains on SIGTERM. Configuration is fail-closed: an unrecognised STUDIO_RUNNER_* variable
# stops the container rather than being ignored, so a mounted database URL or vault address is a
# startup failure by design (architecture §9.2).
#
# No ENTRYPOINT wrapper and no shell form: the process must receive SIGTERM directly so the drain
# path runs. A shell-form CMD would make PID 1 a shell that never forwards the signal, and the
# pod would be killed with an admitted attempt still in flight.
CMD ["node", "dist/main.js"]
