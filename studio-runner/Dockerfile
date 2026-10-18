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
COPY fixtures/observed-reference ./fixtures/observed-reference
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
COPY --from=build /app/scripts/browser-provenance.mjs ./scripts/browser-provenance.mjs
# Prints this image's own observed catalog entry ({profile, build}) from the packaged dist; run it in the
# pushed image: docker run --rm <image> node scripts/print-observed-catalog.mjs <manifest digest>
COPY --from=build /app/scripts/print-observed-catalog.mjs ./scripts/print-observed-catalog.mjs

# The official Playwright image defaults to root, which disables the Chromium sandbox.
# ADR-001 §8 and architecture §9.3 require a non-root user with a writable home.
# The sandbox is never disabled to make the image run; `--no-sandbox` must not be added.
USER pwuser
ENV HOME=/home/pwuser

# Entry point (story 10.6; STUDIO-OBS-009 A2, A6). `dist/main.js` loads configuration, starts the
# ONE TLS listener (replay routes, and the guided-session bridge when STUDIO_RUNNER_GUIDED_ENABLED
# is true) and drains on SIGTERM. Configuration is fail-closed: an unrecognised STUDIO_RUNNER_*
# variable stops the container rather than being ignored, so a mounted database URL or vault
# address is a startup failure by design (architecture §9.2).
#
# **Core dumps off (AC-4, ruling A6).** `ulimit -c 0` runs in the image CMD, never as chart `args`
# (the chart overrides neither `command` nor `args`; asserted by the deployment tier). A core dump
# of a process that held a decrypted secret would be a plaintext copy of it on disk.
#
# **`exec` is what keeps the drain.** The CMD is a shell only so `ulimit` can run first; the last
# command of the list is `exec node ...`, so the shell is REPLACED and node is the container's main
# process. Without `exec` a shell would stay in front of node and never forward SIGTERM: the pod
# would be killed with an admitted attempt in flight, and `docker stop` would wait out its whole
# timeout and emit neither `runner.draining` nor `runner.drained`. That the new CMD still drains is
# the image smoke's property (OWED: no Docker authorization in W2).
#
# **PID 1 (STUDIO-OBS-009 PID-1 b/c).** With `exec`, node keeps the container's PID. In a pod,
# `shareProcessNamespace: true` makes the pause container PID 1, so node is not (guided start
# allowed). In a plain `docker run` without `--init`, node IS PID 1 and a guided start is refused
# `CONFIGURATION_DENIED`; `docker run --init` supplies an init and the start proceeds. The refusal
# is not relaxed to make the fold fit a PID-1 container. No ENTRYPOINT wrapper, so the image still
# starts without one.
CMD ["sh", "-c", "ulimit -c 0 && exec node dist/main.js"]
