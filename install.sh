#!/usr/bin/env bash
# Pruner installer — downloads the correct pre-built binary for your platform.
# Usage: curl -fsSL https://raw.githubusercontent.com/OneGoToAI/Pruner/main/install.sh | bash
set -euo pipefail

RELEASES_REPO="OneGoToAI/Pruner"
INSTALL_DIR="${PRUNER_INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="pruner"

# ── Platform detection ────────────────────────────────────────────────────────
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "${OS}-${ARCH}" in
  darwin-arm64)  FILE="pruner-darwin-arm64" ;;
  darwin-x86_64) FILE="pruner-darwin-x64"   ;;
  linux-x86_64)  FILE="pruner-linux-x64"    ;;
  linux-aarch64) FILE="pruner-linux-x64"    ;;
  *)
    echo "Error: unsupported platform ${OS}-${ARCH}"
    echo "Visit https://github.com/${RELEASES_REPO}/releases for available builds."
    exit 1
    ;;
esac

# ── Resolve latest release tag ────────────────────────────────────────────────
echo "Fetching latest Pruner release..."
LATEST=$(curl -fsSL "https://api.github.com/repos/${RELEASES_REPO}/releases/latest" \
  | grep '"tag_name"' \
  | head -1 \
  | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

if [[ -z "$LATEST" ]]; then
  echo "Error: could not determine latest release version."
  echo "Check https://github.com/${RELEASES_REPO}/releases"
  exit 1
fi

echo "Installing Pruner ${LATEST} for ${OS}/${ARCH}..."

# ── Download binary ───────────────────────────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

URL="https://github.com/${RELEASES_REPO}/releases/download/${LATEST}/${FILE}"
curl -fsSL --progress-bar "$URL" -o "${TMP_DIR}/${BINARY_NAME}"
chmod +x "${TMP_DIR}/${BINARY_NAME}"

# ── Verify checksum ───────────────────────────────────────────────────────────
CHECKSUM_URL="https://github.com/${RELEASES_REPO}/releases/download/${LATEST}/checksums.txt"
if curl -fsSL "$CHECKSUM_URL" -o "${TMP_DIR}/checksums.txt" 2>/dev/null; then
  EXPECTED=$(grep "  ${FILE}$" "${TMP_DIR}/checksums.txt" | awk '{print $1}')
  if [[ -n "$EXPECTED" ]]; then
    if command -v sha256sum &>/dev/null; then
      ACTUAL=$(sha256sum "${TMP_DIR}/${BINARY_NAME}" | awk '{print $1}')
    else
      ACTUAL=$(shasum -a 256 "${TMP_DIR}/${BINARY_NAME}" | awk '{print $1}')
    fi
    if [[ "$ACTUAL" != "$EXPECTED" ]]; then
      echo "Error: checksum mismatch — download may be corrupted."
      echo "  expected: $EXPECTED"
      echo "  actual:   $ACTUAL"
      exit 1
    fi
    echo "Checksum verified ✓"
  fi
fi

# ── Install ───────────────────────────────────────────────────────────────────
DEST="${INSTALL_DIR}/${BINARY_NAME}"

if [[ -w "$INSTALL_DIR" ]]; then
  mv "${TMP_DIR}/${BINARY_NAME}" "$DEST"
else
  echo "Installing to ${DEST} (requires sudo)..."
  sudo mv "${TMP_DIR}/${BINARY_NAME}" "$DEST"
fi

echo ""
echo "Pruner ${LATEST} installed to ${DEST}"
echo ""
echo "Pruner is open source (MIT). Source: https://github.com/${RELEASES_REPO}"
echo ""
echo "Usage:"
echo "  pruner          # drop-in replacement for 'claude'"
echo "  pruner config   # open config file"
echo "  pruner stats    # show historical savings"
echo ""
