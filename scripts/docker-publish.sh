#!/usr/bin/env bash
set -euo pipefail

# 用法示例：
#   ./scripts/docker-publish.sh v1.0.0                                   # 仅构建 data-nest:v1.0.0
#   IMAGE=ghcr.io/you/data-nest PUSH=true ./scripts/docker-publish.sh v1.0.0  # 构建并推送到仓库

IMAGE="${IMAGE:-data-nest}"
TAG="${1:-latest}"

echo "==> Building ${IMAGE}:${TAG}"
docker build -t "${IMAGE}:${TAG}" .

if [ "${PUSH:-false}" = "true" ]; then
  echo "==> Pushing ${IMAGE}:${TAG}"
  docker push "${IMAGE}:${TAG}"
  echo "==> Published ${IMAGE}:${TAG}"
else
  echo "==> Built ${IMAGE}:${TAG} (set PUSH=true to push to registry)"
fi
