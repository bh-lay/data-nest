# syntax=docker/dockerfile:1

# ---- 构建阶段：安装依赖（better-sqlite3 原生模块，保留工具链以支持回退编译）----
FROM node:22-slim AS builder
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- 运行阶段：精简镜像 ----
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# 数据目录（SQLite + JWT 密钥），挂载卷以持久化
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.js"]
