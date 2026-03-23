#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Sync updates from the upstream source repo into this deploy repo
# Usage: ./sync-from-source.sh [source_dir]
# Default source_dir: ~/Downloads/SC-quality-scoring
# ============================================================

SOURCE_DIR="${1:-$HOME/Downloads/SC-quality-scoring}"
TARGET_DIR="$(cd "$(dirname "$0")" && pwd)"

log() { echo -e "\033[1;36m[sync]\033[0m $*"; }
warn() { echo -e "\033[1;33m[skip]\033[0m $*"; }

if [ ! -d "$SOURCE_DIR" ]; then
  echo -e "\033[1;31m[error]\033[0m Source directory not found: $SOURCE_DIR"
  exit 1
fi

log "Source: $SOURCE_DIR"
log "Target: $TARGET_DIR"
echo ""

log "Syncing source files..."

rsync -avz --progress \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'apps/api/dist' \
  --exclude 'apps/web/dist' \
  --exclude 'apps/api/tmp-*' \
  --exclude '*.log' \
  --exclude 'Dockerfile' \
  --exclude 'docker-compose.yml' \
  --exclude '.dockerignore' \
  --exclude 'deploy.sh' \
  --exclude 'sync-from-source.sh' \
  --exclude 'nginx/' \
  --exclude 'mysql/' \
  --exclude 'apps/api/esbuild.config.mjs' \
  "$SOURCE_DIR/" "$TARGET_DIR/"

echo ""
log "Sync complete"
echo ""

warn "Skipped deploy-managed files:"
warn "  Dockerfile / docker-compose.yml / .dockerignore"
warn "  deploy.sh / sync-from-source.sh"
warn "  nginx/ / mysql/ / .env"
warn "  apps/api/esbuild.config.mjs"
echo ""
log "If dependencies changed, run: yarn install"
log "When ready, deploy with: ./deploy.sh"
