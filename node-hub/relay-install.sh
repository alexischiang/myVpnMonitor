#!/usr/bin/env bash
# node-hub relay installer, served by node-hub at /api/v1/server/relay/install.sh.
#
#   curl -fsSL <hub>/api/v1/server/relay/install.sh | sudo bash -s -- --hub <hub> --relay-id <id> --token <token>
#   curl -fsSL <hub>/api/v1/server/relay/install.sh | sudo bash -s -- --uninstall
#
# Installs realm and a systemd timer that pulls this relay's forwarding rules from node-hub every
# 30 seconds (nexora-relay-sync). The sync writes /etc/realm/config.toml, restarts realm when the
# rules change, stops it when there are none, and reports realm's state back on the next pull.
# Running it again upgrades in place and replaces the credentials.
set -euo pipefail

REALM_VERSION="v2.9.6"
HUB=""
RELAY_ID=""
TOKEN=""
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --hub) HUB="${2%/}"; shift 2 ;;
    --relay-id) RELAY_ID="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

[ "$(id -u)" = 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemd is required" >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }

if [ "$UNINSTALL" = 1 ]; then
  systemctl disable --now nexora-relay-sync.timer realm.service 2>/dev/null || true
  rm -f /etc/systemd/system/nexora-relay-sync.timer /etc/systemd/system/nexora-relay-sync.service /etc/systemd/system/realm.service
  rm -f /usr/local/bin/nexora-relay-sync /usr/local/bin/realm
  rm -rf /etc/nexora-relay /etc/realm
  systemctl daemon-reload
  echo "relay removed"
  exit 0
fi

[ -n "$HUB" ] && [ -n "$RELAY_ID" ] && [ -n "$TOKEN" ] || { echo "usage: --hub <url> --relay-id <id> --token <token>" >&2; exit 1; }
case "$RELAY_ID" in *[!0-9]*) echo "--relay-id must be a number" >&2; exit 1 ;; esac
case "$TOKEN" in *[!0-9a-f]*) echo "--token must be the hex token from the admin" >&2; exit 1 ;; esac

case "$(uname -m)" in
  x86_64|amd64) TARGET="x86_64-unknown-linux-musl" ;;
  aarch64|arm64) TARGET="aarch64-unknown-linux-musl" ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

if ! /usr/local/bin/realm --version 2>/dev/null | grep -q "Realm ${REALM_VERSION#v}"; then
  echo "installing realm ${REALM_VERSION} (${TARGET})"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL --max-time 120 -o "$tmp/realm.tar.gz" "https://github.com/zhboner/realm/releases/download/${REALM_VERSION}/realm-${TARGET}.tar.gz"
  tar -xzf "$tmp/realm.tar.gz" -C "$tmp"
  install -m 755 "$tmp/realm" /usr/local/bin/realm
fi

install -d -m 700 /etc/nexora-relay
umask 077
cat > /etc/nexora-relay/env <<EOF
HUB="${HUB}"
RELAY_ID="${RELAY_ID}"
TOKEN="${TOKEN}"
EOF
umask 022
install -d -m 755 /etc/realm

cat > /usr/local/bin/nexora-relay-sync <<'EOF'
#!/usr/bin/env bash
# Pulls this relay's realm rules from node-hub and applies them (installed by node-hub relay-install.sh).
set -euo pipefail
. /etc/nexora-relay/env
CONFIG=/etc/realm/config.toml
state="$(systemctl is-active realm 2>/dev/null || true)"
applied="none"
[ -f "$CONFIG" ] && applied="$(sha256sum "$CONFIG" | cut -c1-16)"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
curl -fsS --max-time 15 -G "${HUB}/api/v1/server/relay/config" \
  --data-urlencode "relay_id=${RELAY_ID}" --data-urlencode "token=${TOKEN}" \
  --data-urlencode "realm=${state:-unknown}" --data-urlencode "applied=${applied}" -o "$tmp"
grep -q '^\[network\]' "$tmp" || { echo "unexpected response from node-hub" >&2; exit 1; }
if ! grep -q '^\[\[endpoints\]\]' "$tmp"; then
  install -m 644 "$tmp" "$CONFIG"
  systemctl stop realm 2>/dev/null || true
elif [ ! -f "$CONFIG" ] || ! cmp -s "$tmp" "$CONFIG"; then
  install -m 644 "$tmp" "$CONFIG"
  systemctl restart realm
elif [ "$state" != "active" ]; then
  systemctl restart realm
fi
EOF
chmod 755 /usr/local/bin/nexora-relay-sync

# realm is started and stopped by the sync, not at boot on its own: with no rules it has nothing to listen on.
cat > /etc/systemd/system/realm.service <<'EOF'
[Unit]
Description=realm relay to node-hub landing nodes
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/realm -c /etc/realm/config.toml
DynamicUser=yes
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576
EOF

cat > /etc/systemd/system/nexora-relay-sync.service <<'EOF'
[Unit]
Description=Pull realm rules from node-hub
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/nexora-relay-sync
EOF

cat > /etc/systemd/system/nexora-relay-sync.timer <<'EOF'
[Unit]
Description=Pull realm rules from node-hub every 30 seconds

[Timer]
OnBootSec=10s
OnUnitActiveSec=30s
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl disable realm.service >/dev/null 2>&1 || true
systemctl enable --now nexora-relay-sync.timer >/dev/null
systemctl start nexora-relay-sync.service
echo "relay ${RELAY_ID} installed: realm $(systemctl is-active realm 2>/dev/null || true), $(grep -c '^\[\[endpoints\]\]' /etc/realm/config.toml || true) forwarding rule(s); rules refresh every 30 seconds"
