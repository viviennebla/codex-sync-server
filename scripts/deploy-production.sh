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

wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  while (( SECONDS < deadline )); do
    if curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
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

# The old deployment worktree can point at a different "origin" main.
# Verify current upstream main using the canonical public repository URL.
UPSTREAM_URL="https://github.com/viviennebla/codex-sync-server.git"
REMOTE_SHA="$(git ls-remote "$UPSTREAM_URL" refs/heads/main | cut -f1)"
[[ -n "$REMOTE_SHA" ]] || fail "could not resolve canonical upstream main"
if [[ "$REMOTE_SHA" != "$EXPECTED_SHA" ]]; then
  fail "main moved: pipeline=$EXPECTED_SHA remote=$REMOTE_SHA; refusing to deploy an untested newer commit"
fi

# Source objects only from this Actions job's already-checked-out tested commit,
# not from the production worktree's misconfigured origin.
TESTED_CHECKOUT="${DENGLEMA_TESTED_CHECKOUT:-${GITHUB_WORKSPACE:-}}"
[[ -n "$TESTED_CHECKOUT" ]] || fail "tested checkout path is required"
CHECKOUT_SHA="$(git -C "$TESTED_CHECKOUT" rev-parse HEAD)" || fail "invalid tested checkout"
[[ "$CHECKOUT_SHA" == "$EXPECTED_SHA" ]] || fail "tested checkout HEAD differs from pipeline SHA"
git fetch --quiet --update-shallow --no-tags "$TESTED_CHECKOUT" HEAD
FETCHED_SHA="$(git rev-parse FETCH_HEAD)"
[[ "$FETCHED_SHA" == "$EXPECTED_SHA" ]] || fail "fetched checkout SHA differs from pipeline SHA"

if [[ "$CURRENT_SHA" == "$EXPECTED_SHA" ]]; then
  log "tested commit is already deployed; verifying health before cutover"
  wait_healthy || fail "health check timed out after ${HEALTH_TIMEOUT}s"
  systemctl --user disable --now denglema-auto-deploy.timer >/dev/null 2>&1 || true
  log "healthy at ${EXPECTED_SHA:0:8}; legacy polling timer disabled"
  exit 0
fi

# The deployment worktree was previously restored from source without node_modules.
# A matching lockfile does not prove that runtime dependencies actually exist.
# npm ci is cheap for this app and ensures native modules are present before restart.
DEPENDENCIES_CHANGED=1

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

if wait_healthy; then
  log "healthy at ${EXPECTED_SHA:0:8}"
  systemctl --user disable --now denglema-auto-deploy.timer >/dev/null 2>&1 || true
  log "legacy polling timer disabled"
  exit 0
fi

# Report only service health metadata; never print production environment
# files, credentials, or user data in a public CI log.
systemctl --user show "$SERVICE_NAME" --no-pager \
  --property=ActiveState --property=SubState --property=Result \
  --property=ExecMainCode --property=ExecMainStatus || true
rollback "health check timed out after ${HEALTH_TIMEOUT}s"
exit 1
