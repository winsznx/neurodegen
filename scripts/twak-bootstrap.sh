#!/bin/sh
# TWAK wallet bootstrap. Runs once at container start.
#
# The TWAK CLI keystore lives at ~/.twak/wallet.json (AES-256 encrypted with
# the password). The CLI has no restore-from-mnemonic command, so we have
# two paths to make the same wallet survive restarts:
#
# 1. TWAK_WALLET_JSON env var holds the full encrypted JSON: copy it into place.
#    The operator runs `twak wallet create` on their dev machine once, then
#    pastes the contents of ~/.twak/wallet.json into the env var on Railway.
#
# 2. No env var set: run `twak wallet create` and PRINT the generated address.
#    Operator must read it from logs and fund that address. NOTE: a fresh
#    wallet is generated on every restart in this branch — funds will be
#    inaccessible after a restart if you didn't back up the mnemonic and
#    inject the JSON. Only use for first-time bootstrap.

set -eu

TWAK_DIR="${HOME}/.twak"
WALLET_FILE="${TWAK_DIR}/wallet.json"

mkdir -p "$TWAK_DIR"

if [ -f "$WALLET_FILE" ]; then
  echo "[twak-bootstrap] wallet already present at $WALLET_FILE"
elif [ -n "${TWAK_WALLET_JSON:-}" ]; then
  # The env var holds the encrypted keystore verbatim. Restore it.
  printf '%s' "$TWAK_WALLET_JSON" > "$WALLET_FILE"
  chmod 600 "$WALLET_FILE"
  echo "[twak-bootstrap] restored wallet from TWAK_WALLET_JSON ($(wc -c < "$WALLET_FILE") bytes)"
elif [ -n "${TWAK_WALLET_PASSWORD:-}" ]; then
  echo "[twak-bootstrap] no wallet found AND no TWAK_WALLET_JSON env. Generating a fresh one"
  echo "[twak-bootstrap] WARNING: funds in this wallet will be lost on next restart unless you save the mnemonic + set TWAK_WALLET_JSON"
  twak wallet create --password "$TWAK_WALLET_PASSWORD" --no-keychain --json
else
  echo "[twak-bootstrap] no wallet, no TWAK_WALLET_JSON, no TWAK_WALLET_PASSWORD. Skipping wallet bootstrap; TWAK commands will fail until configured"
fi

# Hand off to the actual start command.
exec "$@"
