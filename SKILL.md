---
name: neurodegen
version: 0.1.0
description: Autonomous on-chain execution agent for Four.meme — real-time bonding-curve sensing, multi-LLM reasoning, and MYX perpetual execution with verifiable on-chain proof.
author: NeuroDegen Team
license: MIT
category: trading
tags:
  - bnb-chain
  - fourmeme
  - perps
  - myx
  - copy-trade
  - autonomous-agent
protocol: x402
payment:
  token: pieUSD
  tokenAddress: "0x0e63b9c287e32a05e6b9ab8ee8df88a2760225a9"
  chainId: 56
endpoints:
  base: https://neurodegen.xyz
  skill: /api/skill
  info: /api/skill
commands:
  - name: monitor
    paid: true
    price: "0.50"
    description: Start the agent's attention on the current market regime. Opens the managed position pipeline on your behalf.
  - name: positions
    paid: false
    description: List open positions managed by the agent.
  - name: reasoning
    paid: false
    description: Show the most recent reasoning chain with regime, action, confidence, and rationale.
  - name: close-all
    paid: false
    confirmRequired: true
    description: Request the agent to close every managed position.
  - name: status
    paid: false
    description: Agent run state, active regime, cycle count, connected stream clients.
proof:
  contract: "0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4"
  chainId: 56
  explorer: "https://bscscan.com/address/0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4"
---

# NeuroDegen

NeuroDegen is an autonomous execution agent for BNB Chain. Most AI agents in this space stop at analytics. NeuroDegen composes analytics with real on-chain execution and verifiable proof.

## What it does

- **Senses** Four.meme bonding-curve activity through Bitquery v2 WebSockets.
- **Reasons** across three LLM providers (Claude Sonnet 4.6, GPT-4o, DeepSeek v3.2) via DGrid, with an Anthropic-direct fallback.
- **Executes** hedged perpetual positions on MYX Finance through the official SDK.
- **Attests** every decision on-chain — reasoning-commit before submission, execution-reveal after confirmation — so any observer can cryptographically verify the chain of custody on BscScan.

## How to call it

The skill follows the x402 protocol. Free commands respond immediately. The paid `monitor` command responds with HTTP 402 and pricing headers.

### Paid flow

1. Send your command:
   ```bash
   curl -X POST https://neurodegen.xyz/api/skill \
     -H "Content-Type: application/json" \
     -d '{"command":"monitor"}'
   ```
2. Receive `402 Payment Required` with headers:
   - `X-Payment-Amount: 0.50`
   - `X-Payment-Token: 0x0e63b9c287e32a05e6b9ab8ee8df88a2760225a9` (pieUSD on BSC)
   - `X-Payment-Recipient: <neurodegen revenue wallet>`
   - `X-Payment-Chain-Id: 56`
3. Send pieUSD on BSC to the recipient address for the quoted amount.
4. Retry the request with your on-chain payment proof:
   ```bash
   curl -X POST https://neurodegen.xyz/api/skill \
     -H "Content-Type: application/json" \
     -H "X-Payment-Proof: 0x<pieUSD_transfer_tx_hash>" \
     -d '{"command":"monitor"}'
   ```
5. The endpoint re-fetches the tx receipt from BSC, verifies the `Transfer(from, recipient, amount)` log on the pieUSD contract, checks amount ≥ quoted price, and executes the command on success.

Verification is **fully on-chain** — we never hold shared secrets and we never trust the client's claim. If the tx hash does not resolve to a real pieUSD transfer of the quoted amount to our recipient address, the request is rejected.

### Free commands

```bash
curl -X POST https://neurodegen.xyz/api/skill \
  -H "Content-Type: application/json" \
  -d '{"command":"positions"}'
```

Responses for `positions`, `reasoning`, `status`, and `close-all` are returned immediately without payment.

## Verifiable proof

Every agent trade emits two on-chain events on the attestation contract:

- `ReasoningCommitted(bytes32 reasoningHash, bytes32 actionIntent, uint256 timestamp)` — emitted *before* the MYX tx is sent.
- `ExecutionRevealed(bytes32 reasoningHash, bytes32 myxTxHash, bytes32 orderId)` — emitted *after* MYX confirms.

Both events are publicly queryable on BscScan at the contract address above. The service exposes a `/proof/<myxTxHash>` page that:

1. Reads the `ExecutionRevealed` event for the given MYX tx.
2. Finds the matching `ReasoningCommitted` event by `reasoningHash`.
3. Recomputes `keccak256` of the stored reasoning graph and verifies it matches the on-chain hash.
4. Displays the time delta between commit and execution.

If the hash does not match, the proof page says so in red. There is no "trust us" layer.

## Publishing status

This skill manifest is **ready for ClawHub publication pending Pieverse merchant account verification**. The x402 endpoint is live on BSC mainnet and verifying real pieUSD transfers today. Once ClawHub publish credentials are confirmed, the skill will be registered via `purr-cli publish`.
