# MyDiary 多架构 Dockerfile
# 支持 linux/amd64 和 linux/arm64
#
# 构建:
#   docker buildx build --platform linux/amd64,linux/arm64 \
#     -t mydiary:1.0.0 \
#     --push .
#
# 本地测试:
#   docker build --platform linux/amd64 -t mydiary:1.0.0 .

ARG NODE_VERSION=20

# Stage 1: Build frontend
FROM node:${NODE_VERSION}-alpine AS frontend-builder
WORKDIR /app/frontend
# Docker resolves native optional packages for the target architecture.
# Do not copy a lockfile generated on the macOS development host: Vite 8's
# Rolldown/Lightning CSS bindings are platform-specific, and a host-only lock
# can omit the linux-musl packages required by multi-arch builds.
COPY frontend/package.json ./
RUN npm install --include=optional
COPY frontend/ .
RUN npm run build

# Stage 2: Build backend
FROM node:${NODE_VERSION}-alpine
WORKDIR /app

# Install runtime dependencies (for backup/restore/export scripts)
RUN apk add --no-cache zstd curl jq zip

# Copy backend dependencies
WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install --include=optional

# Copy backend source
COPY backend/ .

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Create required directories
RUN mkdir -p /app/uploads /app/storage/attachments /app/storage/exports

# Environment
ENV NODE_ENV=production
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health/ready || exit 1

CMD ["npx", "tsx", "src/index.ts"]
