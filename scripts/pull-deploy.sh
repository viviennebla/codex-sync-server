#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${DENGLEMA_DEPLOY_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE_NAME="${DENGLEMA_DEPLOY_SERVICE:-denglema-dev.service}"
HEALTH_URL="${DENGLEMA_DEPLOY_HEALTH_URL:-http://127.0.0.1:1600/health}"
REMOTE_URL="${DENGLEMA_DEPLOY_REMOTE_URL:-https://github.com/viviennebla/codex-sync-server.git}"
BRANCH="${DENGLEMA_DEPLOY_BRANCH:-main}"
HEALTH_TIMEOUT="${DENGLEMA_DEPLOY_HEALTH_TIMEOUT_SECONDS:-20}"
LOCK_FILE="${XDG_RUNTIME_DIR:-/tmp}/denglema-pull-deploy.lock"

log() {
  printf '[denglema-deploy] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

command -v git >/dev/null 2>&1 || fail "git is required"
command -v npm >/dev/null 2>&1 || fail "npm is required"
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v flock >/dev/null 2>&1 || fail "flock is required"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another deploy is already running; skip"
  exit 0
fi

cd "$REPO_DIR"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "$REPO_DIR is not a git worktree"

if [[ -n "$(git status --porcelain)" ]]; then
  fail "deployment worktree is dirty; refusing to overwrite local changes"
fi

CURRENT_SHA="$(git rev-parse HEAD)"
log "checking $REMOTE_URL $BRANCH from ${CURRENT_SHA:0:8}"
git fetch --quiet --no-tags "$REMOTE_URL" "$BRANCH"
REMOTE_SHA="$(git rev-parse FETCH_HEAD)"

if [[ "$CURRENT_SHA" == "$REMOTE_SHA" ]]; then
  log "already current at ${CURRENT_SHA:0:8}"
  exit 0
fi

DEPENDENCIES_CHANGED=0
if ! git diff --quiet "$CURRENT_SHA" "$REMOTE_SHA" -- package.json package-lock.json; then
  DEPENDENCIES_CHANGED=1
fi

rollback() {
  local reason="$1"
  log "rollback to ${CURRENT_SHA:0:8}: $reason"
  git switch --detach --quiet "$CURRENT_SHA" || true

  if (( DEPENDENCIES_CHANGED )); then
    if [[ -f package-lock.json ]]; then
      npm ci || true
    else
      npm install || true
    fi
  fi

  systemctl --user restart "$SERVICE_NAME" || true
}

log "deploying ${REMOTE_SHA:0:8}"
git switch --detach --quiet "$REMOTE_SHA"

if (( DEPENDENCIES_CHANGED )); then
  log "dependency manifest changed; refreshing node_modules"
  if [[ -f package-lock.json ]]; then
    if ! npm ci; then
      rollback "npm ci failed"
      exit 1
    fi
  elif ! npm install; then
    rollback "npm install failed"
    exit 1
  fi
fi

log "running test suite"
if ! npm test; then
  rollback "tests failed"
  exit 1
fi

log "restarting $SERVICE_NAME"
if ! systemctl --user restart "$SERVICE_NAME"; then
  rollback "service restart failed"
  exit 1
fi

deadline=$((SECONDS + HEALTH_TIMEOUT))
while (( SECONDS < deadline )); do
  if curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" >/dev/null; then
    log "healthy at ${REMOTE_SHA:0:8}"
    exit 0
  fi
  sleep 1
done

rollback "health check timed out after ${HEALTH_TIMEOUT}s"
exit 1
