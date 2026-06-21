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

# Loud + tolerant. Old version used `set -eu` which aborted the entrypoint
# on any non-fatal failure (e.g. twak wallet create returning non-zero).
# Now we just `set -u` (catch unset vars) and let each branch handle its own
# errors with explicit log lines.
set -u

echo "[twak-bootstrap] starting (HOME=$HOME, args=$*)"

TWAK_DIR="${HOME}/.twak"
WALLET_FILE="${TWAK_DIR}/wallet.json"

mkdir -p "$TWAK_DIR"

if [ -f "$WALLET_FILE" ]; then
  echo "[twak-bootstrap] wallet already present at $WALLET_FILE ($(wc -c < "$WALLET_FILE") bytes)"
elif [ -n "${TWAK_WALLET_JSON:-}" ]; then
  printf '%s' "$TWAK_WALLET_JSON" > "$WALLET_FILE"
  chmod 600 "$WALLET_FILE"
  echo "[twak-bootstrap] restored wallet from TWAK_WALLET_JSON ($(wc -c < "$WALLET_FILE") bytes)"
elif [ -n "${TWAK_WALLET_PASSWORD:-}" ]; then
  echo "[twak-bootstrap] no wallet found AND no TWAK_WALLET_JSON env. Generating a fresh one"
  echo "[twak-bootstrap] WARNING: funds in this wallet will be lost on next restart unless you save the mnemonic + set TWAK_WALLET_JSON"
  twak wallet create --password "$TWAK_WALLET_PASSWORD" --no-keychain --json || echo "[twak-bootstrap] wallet create exit=$?"
else
  echo "[twak-bootstrap] no wallet, no TWAK_WALLET_JSON, no TWAK_WALLET_PASSWORD. Skipping wallet bootstrap; TWAK commands will fail until configured"
fi

# Smoke check: try to read the address. If this fails the wallet/password
# pair is mismatched; the agent loop will see TWAK errors but at least we
# log the root cause here.
if [ -f "$WALLET_FILE" ] && [ -n "${TWAK_WALLET_PASSWORD:-}" ]; then
  ADDR_OUTPUT=$(twak wallet address --chain ethereum --password "$TWAK_WALLET_PASSWORD" --json 2>&1) || true
  echo "[twak-bootstrap] wallet smoke: $(echo "$ADDR_OUTPUT" | head -c 250)"
fi

echo "[twak-bootstrap] exec'ing: $*"
exec "$@"
