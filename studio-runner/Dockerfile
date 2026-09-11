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

FROM ${REGISTRY}/playwright:v${PLAYWRIGHT_VERSION}-${PLAYWRIGHT_DISTRO} AS build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
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

# Story 10.6 adds src/main.ts (server entry point). Until then the image has no entry point
# beyond the library build, and this CMD fails loudly rather than starting something undefined.
CMD ["node", "dist/main.js"]
