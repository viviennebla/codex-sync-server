#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${DENGLEMA_DEPLOY_REPO:-/home/feiyan/workspace/codex-sync-server-denglema-feishu}"
SERVICE_NAME="${DENGLEMA_DEPLOY_SERVICE:-denglema-dev.service}"
HEALTH_URL="${DENGLEMA_DEPLOY_HEALTH_URL:-http://10.21.5.77:1600/health}"
EXPECTED_SHA="${DENGLEMA_EXPECTED_SHA:-}"
HEALTH_TIMEOUT="${DENGLEMA_DEPLOY_HEALTH_TIMEOUT_SECONDS:-20}"
LOCK_TIMEOUT="${DENGLEMA_DEPLOY_LOCK_TIMEOUT_SECONDS:-600}"
LOCK_FILE="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/denglema-pull-deploy.lock"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o Hostname=ssh.github.com -p 443 -o StrictHostKeyChecking=accept-new}"

log() {
  printf '[denglema-deploy] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

[[ -n "$EXPECTED_SHA" ]] || fail "DENGLEMA_EXPECTED_SHA is required for runner deployment"

for command in git npm curl flock systemctl; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -w "$LOCK_TIMEOUT" 9; then
  fail "timed out waiting for deploy lock after ${LOCK_TIMEOUT}s"
fi

cd "$REPO_DIR"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "$REPO_DIR is not a git worktree"

if [[ -n "$(git status --porcelain)" ]]; then
  fail "deployment worktree is dirty; refusing to overwrite local changes"
fi

CURRENT_SHA="$(git rev-parse HEAD)"
log "current=${CURRENT_SHA:0:8} tested=${EXPECTED_SHA:0:8}"

git fetch --quiet --no-tags origin main
REMOTE_SHA="$(git rev-parse origin/main)"
if [[ "$REMOTE_SHA" != "$EXPECTED_SHA" ]]; then
  fail "main moved: pipeline=$EXPECTED_SHA remote=$REMOTE_SHA; refusing to deploy an untested newer commit"
fi

if [[ "$CURRENT_SHA" == "$EXPECTED_SHA" ]]; then
  log "tested commit is already deployed"
  systemctl --user disable --now denglema-auto-deploy.timer >/dev/null 2>&1 || true
  exit 0
fi

DEPENDENCIES_CHANGED=0
if ! git diff --quiet "$CURRENT_SHA" "$EXPECTED_SHA" -- package.json package-lock.json; then
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

log "deploying tested commit ${EXPECTED_SHA:0:8}"
git switch --detach --quiet "$EXPECTED_SHA"

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

log "restarting $SERVICE_NAME"
if ! systemctl --user restart "$SERVICE_NAME"; then
  rollback "service restart failed"
  exit 1
fi

deadline=$((SECONDS + HEALTH_TIMEOUT))
while (( SECONDS < deadline )); do
  if curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" >/dev/null; then
    log "healthy at ${EXPECTED_SHA:0:8}"
    systemctl --user disable --now denglema-auto-deploy.timer >/dev/null 2>&1 || true
    log "legacy polling timer disabled"
    exit 0
  fi
  sleep 1
done

rollback "health check timed out after ${HEALTH_TIMEOUT}s"
exit 1
