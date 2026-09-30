#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${DENGLEMA_DEPLOY_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE_NAME="${DENGLEMA_DEPLOY_SERVICE:-denglema-dev.service}"
HEALTH_URL="${DENGLEMA_DEPLOY_HEALTH_URL:-http://10.21.5.77:1600/health}"
INTERVAL="${DENGLEMA_DEPLOY_INTERVAL:-1min}"
NODE_BIN_DIR="$(dirname "$(command -v node)")"
SERVICE_PATH="$NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

if [[ "$REPO_DIR" =~ [[:space:]] ]]; then
  echo "Repository paths containing whitespace are not supported by this installer." >&2
  exit 1
fi

USER_UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
AUTO_SERVICE="$USER_UNIT_DIR/denglema-auto-deploy.service"
AUTO_TIMER="$USER_UNIT_DIR/denglema-auto-deploy.timer"

mkdir -p "$USER_UNIT_DIR"
cat >"$AUTO_SERVICE" <<EOF
[Unit]
Description=Denglema pull-based auto deploy
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$REPO_DIR
Environment=DENGLEMA_DEPLOY_REPO=$REPO_DIR
Environment=DENGLEMA_DEPLOY_SERVICE=$SERVICE_NAME
Environment=DENGLEMA_DEPLOY_HEALTH_URL=$HEALTH_URL
Environment=PATH=$SERVICE_PATH
ExecStart=/usr/bin/env bash $REPO_DIR/scripts/pull-deploy.sh
EOF

cat >"$AUTO_TIMER" <<EOF
[Unit]
Description=Check Denglema main for updates

[Timer]
OnBootSec=45s
OnUnitActiveSec=$INTERVAL
AccuracySec=10s
RandomizedDelaySec=8s
Persistent=true
Unit=denglema-auto-deploy.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now denglema-auto-deploy.timer

echo "Installed:"
echo "  $AUTO_SERVICE"
echo "  $AUTO_TIMER"
echo
echo "Timer:"
systemctl --user list-timers denglema-auto-deploy.timer --no-pager || true
echo
echo "Run one check now:"
echo "  systemctl --user start denglema-auto-deploy.service"
echo "Logs:"
echo "  journalctl --user -u denglema-auto-deploy.service -n 100 --no-pager"
