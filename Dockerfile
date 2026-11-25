# Check: type-check and the full test suite run during the build, so a failing check fails the
# image build and the deploy workflow leaves the running container untouched.
ARG NODE_IMAGE=node:22-slim
FROM ${NODE_IMAGE} AS check
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run typecheck && npm test

# Run: production dependencies, the app, the page and the synthetic demo documents.
FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=3000 CFONE_STATE_DIR=/data MOZAIK_REDACTION=content
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=check /app/tsconfig.json ./
COPY --from=check /app/src ./src
COPY --from=check /app/web ./web
COPY --from=check /app/data/synthetic ./data/synthetic
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/server.ts"]
