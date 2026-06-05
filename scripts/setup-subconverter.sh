#!/bin/bash
set -e

INSTALL_DIR="$HOME/subconverter"
PREF="$INSTALL_DIR/pref.toml"
VERSION_URL="https://api.github.com/repos/MetaCubeX/subconverter/releases/latest"

# Detect platform
OS=$(uname -s)
ARCH=$(uname -m)
case "$OS-$ARCH" in
  Darwin-arm64) ASSET="subconverter_darwinarm.tar.gz" ;;
  Darwin-x86_64) ASSET="subconverter_darwin64.tar.gz" ;;
  Linux-x86_64) ASSET="subconverter_linux64.tar.gz" ;;
  Linux-aarch64) ASSET="subconverter_linuxarm.tar.gz" ;;
  *) echo "Unsupported platform: $OS-$ARCH"; exit 1 ;;
esac

# Check if already running
if curl -s --noproxy '*' --max-time 2 http://127.0.0.1:25500/version &>/dev/null; then
  echo "subconverter already running"
  exit 0
fi

# Download if not installed
if [ ! -f "$INSTALL_DIR/subconverter" ]; then
  echo "Downloading subconverter ($ASSET)..."
  TAG=$(curl -s "$VERSION_URL" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
  URL="https://github.com/MetaCubeX/subconverter/releases/download/$TAG/$ASSET"
  TMP=$(mktemp -d)
  curl -L -o "$TMP/sc.tar.gz" "$URL"
  tar xzf "$TMP/sc.tar.gz" -C "$TMP"
  mkdir -p "$INSTALL_DIR"
  cp -r "$TMP/subconverter/." "$INSTALL_DIR/"
  chmod +x "$INSTALL_DIR/subconverter"
  rm -rf "$TMP"
  echo "Installed to $INSTALL_DIR"
fi

# Configure pref.toml
if [ -f "$PREF" ]; then
  sed -i.bak \
    -e 's/^proxy_subscription *= *"SYSTEM"/proxy_subscription = "NONE"/' \
    -e 's|^# *default_external_config *= *.*|default_external_config = "https://raw.githubusercontent.com/cutethotw/ClashRule/main/GeneralClashRule.ini"|' \
    "$PREF"
fi

# Start
echo "Starting subconverter..."
cd "$INSTALL_DIR"
nohup ./subconverter > /tmp/subconverter.log 2>&1 &
sleep 2

if curl -s --noproxy '*' --max-time 3 http://127.0.0.1:25500/version &>/dev/null; then
  echo "subconverter started: $(curl -s --noproxy '*' http://127.0.0.1:25500/version)"
else
  echo "Failed to start. Check /tmp/subconverter.log"
  exit 1
fi
