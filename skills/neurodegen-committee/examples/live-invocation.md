# Live invocation transcript

## User

```
/neurodegen check now
```

## Assistant

```
Step 1 - Snapshot

Calling 7 CMC tools in parallel:
  - get_crypto_quotes_latest    (BNB, CAKE, ETH, BTCB, USDT, BUSD)
  - get_global_metrics_latest
  - get_global_crypto_derivatives_metrics
  - trending_crypto_narratives
  - get_crypto_latest_news
  - get_crypto_metrics           (premium, EV gate ok)
  - search_crypto_info           (premium, EV gate ok)

Snapshot:
  fearGreedValue:     65 (greed)
  activeSurgeTokens:  4
  topMovers:          BNB +7.2%, CAKE +8.1%, ETH +6.0%, BTCB +5.4%
  fundingRates:       BNBUSDT 0.0006, ETHUSDT 0.0008 (no spike)
  kolHotTokens:       BNB v=7.5/h, CAKE v=6.2/h

Step 2 - Regime

  -> momentum: F&G 65 in [60,85], surge 4 >= 4, two KOL-hot tokens.

Step 3 - Analysts (parallel)

  Narrative:  bullish @ 0.70, topThesis=BNB, kolMentioned=[BNB, CAKE]
  Quant:      bullish @ 0.67, recommendedToken=BNB, liqAdequate=true, fundingWarn=false

Step 4 - Dissent

  Severity: none (both bullish) -> modifier 1.0

Step 5 - Risk gate

  min(conf) = 0.67 >= 0.30          PASS
  dissent  != strong                 PASS
  liquidityAdequate                  PASS
  fundingRateWarning false           PASS
  candidate set intersect allowlist  PASS -> BNB

Step 6 - Sizing

  size = 100 * regime(1.0) * dissent(1.0) * mandate(1.0) * dd(1.0) = 100.00 USD
  caps: pos <= 200 ok; exposure 100 <= 0.8 * 1000 = 800 ok

Step 7 - Decision

  action:      open_long
  targetToken: BNB
  sizeUsd:     100.00
  rationale:   Open long BNB in momentum regime. Narrative bullish@0.70, quant bullish@0.67, dissent none.

Full record written to examples/sample-output.json.
```
