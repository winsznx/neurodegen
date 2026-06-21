# How NeuroDegen actually works

This is the read-it-once-and-understand-the-whole-thing doc. Most repos make you bounce between five files to figure out what is going on. Here you get one walkthrough, top to bottom.

## What it is, in one paragraph

NeuroDegen is a background worker that watches the BNB Chain market every minute or so, asks three different language models what to do, picks the strongest answer, signs a swap through Trust Wallet Agent Kit, and commits the reasoning to a smart contract on BSC before the swap fires. Once the swap confirms, it reveals the link between the reasoning hash and the transaction hash on chain. Anyone can replay any trade later using BscScan alone, with zero trust in our database or our website.

The point is not to make money. The point is that nothing about this agent's behaviour requires you to take its word for anything.

## The five-second tour

Two services run on Railway:

- a worker that runs the agent loop
- a Next.js app that serves the dashboard, the journal, and the verification pages

The two talk over Railway's internal network. The worker pushes events; the web service relays them as Server-Sent Events to anyone watching the live page.

There's also a Telegram bot that mirrors the worker's bigger moments to a channel. And a Postgres database (Supabase) that holds every session, position, and committee output the agent has ever produced.

## What happens during one cycle

Open `src/worker/index.ts` and follow along.

The worker boots. The first thing the entry point script does is restore the agent's TWAK wallet from an environment variable. If you set `TWAK_WALLET_JSON`, the bootstrap script writes it to `/root/.twak/wallet.json` so the TWAK CLI can read it. Then it calls `twak compete register` if the agent is not already registered on the competition contract, and `twak erc8004 register` if it does not have an ERC-8004 identity yet. Both calls are idempotent because we cache the results in a `worker_state` table.

After that it kicks off the agent loop, which ticks roughly once a minute.

Inside a single tick, here's the order:

1. The worker calls CoinMarketCap through its MCP endpoint and pulls quotes, fear-and-greed, narratives, news, derivatives metrics. Whatever is not free is gated by an "is this worth paying for" check. If the gate says yes, it pays in USDC on Base through x402, and the CMC server settles the payment before returning the data.

2. The aggregator collapses the raw data into a single regime label. There are four: quiet, active, momentum, volatile. Different regimes change how the rest of the cycle behaves (quiet means do nothing this round; volatile means tighter risk).

3. Three LLMs are called in parallel. The narrative analyst (Claude Sonnet) reads the news and KOL activity and produces a sentiment direction. The quant analyst (GPT-4o) looks at funding rates, liquidity, price impact. The risk classifier (DeepSeek) is held back until after the dissent check.

4. The dissent tracker compares the narrative analyst's direction to the quant analyst's. If they agree, position size is full. If one is neutral and the other is not, position size is cut in half. If they actively disagree (one bullish, one bearish), the agent holds and does not trade this cycle.

5. The risk classifier runs with both analyst outputs plus the dissent verdict. It picks the final action: open_long, close_position, adjust_parameters, or hold.

6. If the action is not hold, eight pre-execution checks fire in sequence. The token must be in the 149-token allowlist. CMC price must not diverge from Pyth's oracle. There must be enough liquidity for a $1000 trade. The token's security score must be above the threshold. There must be enough USDT in the agent wallet. The agent must be under the daily PnL cap. Drawdown must be in a tier that allows the action. Total exposure must be under the cap.

7. If all eight pass, the agent calls `attestationEmitter.commitReasoning(reasoningHash, actionIntent)` first. This writes a `ReasoningCommitted` event to the V2 AttestationEmitter contract at `0xf3ac420e…`. The reasoning hash is the keccak256 of a canonical JSON of the entire session. After that event lands, only then does the agent call `twakClient.executeSwap`, which spawns the TWAK CLI and signs the swap. When the swap confirms, the agent calls `attestationEmitter.revealExecution(reasoningHash, twakTxHash)`. Now any observer can pull the two events, recompute the reasoning hash from our database, and confirm that the hash committed before the swap matches.

8. The position is written to Postgres. The Telegram channel gets a message with inline buttons linking to `/proof/<txHash>` and BscScan. The SSE stream broadcasts a `position_update` event to anyone watching `/agent`.

That is one cycle. The next one starts about a minute later. If the regime is quiet, most cycles skip steps 3 through 8 because the strategy says do not bother.

## Where each part lives

If you want to read the code in order:

- `src/worker/index.ts` is the entrypoint. Look at the `main()` function.
- `src/lib/services/agentLoop.ts` holds `runCycle()`. This is the conductor.
- `src/lib/services/perception/cmcIngester.ts` pulls market data.
- `src/lib/clients/cmcHubClient.ts` is the actual MCP client.
- `src/lib/services/cognition/committeeSession.ts` orchestrates the three LLMs.
- `src/lib/services/cognition/dissentTracker.ts` decides agreement vs disagreement.
- `src/lib/services/execution/twakExecutor.ts` runs the eight checks and signs the swap.
- `src/lib/services/execution/attestationEmitter.ts` writes to the BSC contract.
- `contracts/NeurodegenAttestationV2.sol` is the contract itself.

The web pages are in `src/app/`. The interesting ones:

- `src/app/agent/page.tsx` is the live dashboard
- `src/app/journal/page.tsx` is the session list
- `src/app/session/[id]/page.tsx` shows one session in full
- `src/app/proof/[txHash]/page.tsx` is the verification page

## Setting it up yourself

You need Node 22 or newer, pnpm 10.33 or newer, and Docker if you want to mirror the worker exactly. You also need:

1. A Supabase project (free tier is enough for a single agent)
2. A BSC RPC URL. The public Binance endpoint `https://bsc-dataseed.binance.org` works fine.
3. A CoinMarketCap Pro API key from `coinmarketcap.com/api`. Free tier is enough for the cadence we run at.
4. A DGrid API key from your DGrid account, or your own Anthropic and OpenAI keys.
5. Trust Wallet Agent Kit installed: `npm i -g @trustwallet/cli`
6. A TWAK wallet created: `twak wallet create --password 'YourStrongPassword' --no-keychain --json`. Write down the address.

In the repo:

```
git clone https://github.com/winsznx/neurodegen
cd neurodegen
pnpm install
cp .env.example .env.local
```

Fill in `.env.local` with the values from above. The required ones are:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
BSC_RPC_URL=https://bsc-dataseed.binance.org
CMC_PRO_API_KEY=
DGRID_API_KEY=
TWAK_WALLET_PASSWORD=
TWAK_AGENT_WALLET_ADDRESS=
ADMIN_SECRET=any-32-char-random-string
```

Then run the database migrations. Open the Supabase SQL editor and paste the contents of `supabase/migrations/005_v2_schema.sql` and `supabase/migrations/006_worker_state.sql`. Then run this GRANT block so the service role can actually read and write:

```sql
GRANT USAGE ON SCHEMA neurodegen TO service_role, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA neurodegen TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA neurodegen TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA neurodegen TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA neurodegen GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA neurodegen GRANT SELECT ON TABLES TO anon, authenticated;
```

Now start the two processes in separate terminals:

```
pnpm dev         # Next.js on port 3000
pnpm worker      # agent on port 8080
```

Visit `http://localhost:3000`. The landing page should render. Hit `http://localhost:3000/api/health` and confirm `services.database` is true. Watch the worker logs. You should see `[twak-bootstrap] starting`, then the registration calls, then `[cmc-ingester] started`, then a cycle complete log line once a minute.

## What to look at to know it's working

Five spots, ranked by usefulness:

`/api/health` is the fastest sanity check. It tells you whether the worker is up, whether the database is reachable, whether competition registration landed, whether ERC-8004 identity landed. If `services.healthy` is true, you are good.

`/agent` is the live dashboard. The regime label, cycle count, drawdown, and recent sessions all update over SSE. If cycle count is going up, the agent is alive.

`/journal` is every session the agent has ever produced. Click any row to see what the three analysts said and how the dissent resolved.

`/proof/<txHash>` is the verification page for a specific executed trade. Replace `<txHash>` with the TWAK swap tx hash from the journal. You get eight green or red flags. If they are all green, the trade matches its committed reasoning byte for byte.

The Telegram channel mirrors the bigger moments if you set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Boot messages, position opens, position closes, regime shifts, drawdown tier changes.

## What breaks and what to do

If `/journal` is empty, you have no completed cycles. Worker logs will tell you why. The two common ones:

`permission denied for schema neurodegen` means the GRANT block above did not run. The newly created schema does not grant USAGE to service_role by default. Paste the GRANT block in the Supabase SQL editor.

`twak balance failed [exit=1]` means the TWAK CLI rejected the call. Make sure TWAK is on the path inside the runtime, `TWAK_WALLET_JSON` is set, and the password matches. Run `twak wallet balance --chain bsc --json` directly to see the actual error.

If `competition.registration` is null and you are inside the trading window, run `twak compete register` from inside the container or from the same machine the TWAK CLI is on. It is idempotent.

If `/api/health` says `database: false`, check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Both are required.

If the BSC RPC rate-limits you, switch to a different endpoint. The public ones are flaky under load. PublicNode and Ankr are both reliable.

If TWAK swap calls return 403 Forbidden, your TWAK API key tier does not include the Trade scope. Either upgrade at `portal.trustwallet.com`, or move funds to a wallet you can swap from manually.

## The three on-chain rails

This is the part that makes the agent verifiable.

Rail one is the AttestationEmitter contract at `0xf3ac420e9bd8bb63f42cb6678126dc78c69deba3`. It only emits events; no funds live there. Every executed cycle gets a `ReasoningCommitted` event before the swap and an `ExecutionRevealed` event after. The commit references a keccak256 hash of the session JSON. The reveal references the TWAK swap tx hash. Two events, two block heights, two signatures.

Rail two is ERC-8004. The agent's identity is registered with the registry at `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`. The agent has a unique numeric ID (ours is 139974). The agent card lives at `/api/agent-card` and follows the EIP-8004 spec.

Rail three is ERC-8183. Optional. Disabled by default. Requires the agent to hold a small amount of U-token for funding commerce jobs. When enabled, every executed cycle is wrapped as a self-employed job: the agent acts as both buyer and seller of its own analysis, and submits a deliverable manifest containing the reasoning hash and the swap tx hash. We did not enable this for the live window because it costs more than we wanted to spend, but the code is there.

Any of the three rails can independently prove the same trade existed and matched the reasoning.

## The license

AGPL-3.0-only. If you run a modified version that other people can interact with, you are obliged to publish the changes. If you read it and learn from it without modifying or hosting, you owe nothing.
