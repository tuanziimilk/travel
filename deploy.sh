#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Read deploy config from .env
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo -e "\033[1;31m[error]\033[0m Missing .env file: $ENV_FILE"
  exit 1
fi

set -o allexport
eval "$(grep -E '^DEPLOY_' "$ENV_FILE")"
set +o allexport

SERVER_USER="${DEPLOY_SERVER_USER:?Missing DEPLOY_SERVER_USER in .env}"
SERVER_HOST="${DEPLOY_SERVER_HOST:?Missing DEPLOY_SERVER_HOST in .env}"
SERVER_DIR="${DEPLOY_SERVER_DIR:?Missing DEPLOY_SERVER_DIR in .env}"
SSH_KEY_RAW="${DEPLOY_SSH_KEY:-}"
SSH_KEY=""
TEMP_SSH_KEY=""

# ============================================================
# Helpers
# ============================================================
log() { echo -e "\033[1;36m[deploy]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" >&2; exit 1; }

resolve_ssh_key_path() {
  local raw="$1"
  local candidate=""

  [ -n "$raw" ] || return 0

  case "$raw" in
    "~/"*)
      candidate="${HOME}/${raw#~/}"
      ;;
    [A-Za-z]:\\*)
      local drive="${raw:0:1}"
      local rest="${raw:2}"
      rest="${rest//\\//}"
      candidate="/mnt/${drive,,}${rest}"
      ;;
    *)
      candidate="$raw"
      ;;
  esac

  printf '%s\n' "$candidate"
}

SSH_KEY="$(resolve_ssh_key_path "${SSH_KEY_RAW}")"

cleanup() {
  if [ -n "${TEMP_SSH_KEY}" ] && [ -f "${TEMP_SSH_KEY}" ]; then
    rm -f "${TEMP_SSH_KEY}"
  fi
}
trap cleanup EXIT

if [ -n "${SSH_KEY}" ]; then
  [ -f "${SSH_KEY}" ] || err "SSH key not found: ${SSH_KEY}"
  TEMP_SSH_KEY="$(mktemp)"
  cp "${SSH_KEY}" "${TEMP_SSH_KEY}"
  chmod 600 "${TEMP_SSH_KEY}"
  SSH_KEY="${TEMP_SSH_KEY}"
fi

SSH_OPTS="-o StrictHostKeyChecking=no ${SSH_KEY:+-i ${SSH_KEY}}"
ssh_run() { ssh ${SSH_OPTS} "${SERVER_USER}@${SERVER_HOST}" "$@"; }

COMMIT_SHA="$(git rev-parse HEAD)"
COMMIT_SHORT="$(git rev-parse --short HEAD)"
REMOTE_TMP_DIR="${SERVER_DIR}.deploy-tmp-${COMMIT_SHORT}-$$"

if ! git diff --quiet || ! git diff --cached --quiet; then
  log "Working tree has uncommitted changes"
  log "Deploying committed HEAD only: ${COMMIT_SHA}"
else
  log "Deploying clean HEAD: ${COMMIT_SHA}"
fi

# ============================================================
# Step 1: Export committed source code to a remote temp directory
# ============================================================
log "Preparing remote temp dir -> ${SERVER_USER}@${SERVER_HOST}:${REMOTE_TMP_DIR}"
ssh_run "rm -rf '${REMOTE_TMP_DIR}' && mkdir -p '${REMOTE_TMP_DIR}'"

log "Uploading committed files from HEAD"
git archive --format=tar "${COMMIT_SHA}" | ssh ${SSH_OPTS} "${SERVER_USER}@${SERVER_HOST}" "tar -xf - -C '${REMOTE_TMP_DIR}'"

# ============================================================
# Step 2: Sync committed snapshot into the real deploy directory
# ============================================================
log "Syncing committed snapshot -> ${SERVER_DIR}"

ssh_run bash <<REMOTE
set -euo pipefail

mkdir -p ${SERVER_DIR}

rsync -a --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'apps/api/dist' \
  --exclude 'apps/api/.runtime/' \
  --exclude 'apps/web/dist' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'logs/' \
  --exclude '*.log' \
  --exclude 'tmp/' \
  --exclude 'storage/' \
  --exclude 'uploads/' \
  --exclude '*.db' \
  --exclude '*.sqlite' \
  --exclude 'apps/api/tmp-*' \
  --exclude 'nginx/' \
  ${REMOTE_TMP_DIR}/ ${SERVER_DIR}/

rm -rf ${REMOTE_TMP_DIR}
REMOTE

# ============================================================
# Step 3: Remote deploy
# ============================================================
log "Starting remote deploy..."

ssh_run bash <<REMOTE
set -euo pipefail

cd ${SERVER_DIR}

if [ ! -f .env ]; then
  echo "Missing .env on server."
  echo "Run:"
  echo "  cp ${SERVER_DIR}/.env.example ${SERVER_DIR}/.env"
  echo "Then edit .env and run deploy.sh again."
  exit 1
fi

docker compose --env-file .env up --build -d

echo ""
echo "============ Extract web dist ============"
BUILDER_IMAGE=\$(docker build --target builder -q .)
CONTAINER=\$(docker create "\$BUILDER_IMAGE")
mkdir -p ${SERVER_DIR}/apps/web/dist
docker cp "\$CONTAINER":/app/apps/web/dist/. ${SERVER_DIR}/apps/web/dist/
docker rm "\$CONTAINER"
echo "web dist updated -> ${SERVER_DIR}/apps/web/dist"

echo ""
echo "============ migrate logs ============"
docker compose logs --tail=50 migrate || true
echo "======================================"

echo ""
docker compose ps
REMOTE

log "Deploy finished"
log "Web:    http://${SERVER_HOST}:5173"
log "Health: http://${SERVER_HOST}:3001/health"
