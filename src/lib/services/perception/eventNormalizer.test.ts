import { describe, it, expect } from 'vitest';
import {
  normalizeCmcQuotes,
  normalizeDerivatives,
  normalizeDexLiquidity,
  normalizeFearGreed,
  normalizeNews,
  normalizePythDivergence,
  normalizeSecurity,
  normalizeSocial,
  normalizeTrendingNarratives,
} from './eventNormalizer';

describe('normalizeCmcQuotes', () => {
  it('handles the v1 dict-of-symbol shape', () => {
    // #given the canonical CMC quotes/latest dict shape
    const raw = {
      data: {
        BTC: {
          symbol: 'BTC',
          cmc_rank: 1,
          platform: null,
          quote: {
            USD: {
              price: 66000.5,
              volume_24h: 12_000_000_000,
              percent_change_1h: 0.4,
              percent_change_24h: 2.1,
              market_cap: 1_300_000_000_000,
            },
          },
        },
      },
    };

    // #when normalized
    const events = normalizeCmcQuotes(raw, {});

    // #then a single CMCQuoteEvent comes back
    expect(events).toHaveLength(1);
    expect(events[0].tokenSymbol).toBe('BTC');
    expect(events[0].priceUSD).toBe(66000.5);
  });

  it('handles the v2 list shape', () => {
    // #given the v2 list-of-objects shape
    const raw = [
      {
        symbol: 'CAKE',
        cmc_rank: 70,
        platform: {
          token_address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
        },
        quote: {
          USD: {
            price: 2.84,
            volume_24h: 12_345_678,
            percent_change_1h: 1.2,
            percent_change_24h: 3.5,
            market_cap: 800_000_000,
          },
        },
      },
    ];

    // #when normalized
    const events = normalizeCmcQuotes(raw, {});

    // #then the token address from platform is preserved
    expect(events).toHaveLength(1);
    expect(events[0].tokenAddress).toBe(
      '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    );
  });

  it('skips entries that fail schema validation', () => {
    // #given mixed valid and invalid entries
    const raw = [
      { symbol: 'OK', quote: { USD: { price: 1, volume_24h: 1, percent_change_1h: 0, percent_change_24h: 0 } } },
      { symbol: 'BAD', quote: null },
      'garbage',
    ];

    // #when normalized
    const events = normalizeCmcQuotes(raw, {});

    // #then only the valid entry is returned
    expect(events).toHaveLength(1);
    expect(events[0].tokenSymbol).toBe('OK');
  });
});

describe('normalizeFearGreed', () => {
  it('derives the label from value when value_classification is missing', () => {
    // #given a global metrics response with only the numeric value
    const raw = { data: { fear_and_greed: { value: 78 } } };

    // #when normalized
    const event = normalizeFearGreed(raw);

    // #then the label is derived from the value (75-100 = extreme_greed)
    expect(event?.value).toBe(78);
    expect(event?.label).toBe('extreme_greed');
  });

  it('accepts the snake-case classification provided by CMC', () => {
    // #given an explicit classification
    const raw = { data: { fear_and_greed: { value: 35, value_classification: 'Fear' } } };

    // #when normalized
    const event = normalizeFearGreed(raw);

    // #then the classification is canonicalized to snake_case
    expect(event?.label).toBe('fear');
  });

  it('returns null when no fear-and-greed payload is present', () => {
    // #given an unrelated response
    const event = normalizeFearGreed({ data: { something: 'else' } });

    // #then null is returned
    expect(event).toBeNull();
  });
});

describe('normalizeTrendingNarratives', () => {
  it('extracts label + topTokens + momentumScore', () => {
    // #given a trending narratives payload
    const raw = {
      data: [
        { label: 'ai-agents', top_tokens: ['AGNT', 'FET'], momentum_score: 0.84 },
      ],
    };

    // #when normalized
    const events = normalizeTrendingNarratives(raw);

    // #then the narrative is captured with momentum
    expect(events).toHaveLength(1);
    expect(events[0].narrativeLabel).toBe('ai-agents');
    expect(events[0].topTokens).toEqual(['AGNT', 'FET']);
    expect(events[0].momentumScore).toBe(0.84);
  });
});

describe('normalizeDerivatives', () => {
  it('annualizes 8h funding rate when annualized is absent', () => {
    // #given a payload with only the 8h funding rate
    const raw = { data: [{ pair: 'BNB/USDT', funding_rate_8h: 0.0001 }] };

    // #when normalized
    const events = normalizeDerivatives(raw);

    // #then funding_rate_annualized = 8h * 3 * 365
    expect(events).toHaveLength(1);
    expect(events[0].fundingRateAnnualized).toBeCloseTo(0.1095, 4);
    expect(events[0].direction).toBe('rising');
  });
});

describe('normalizeSecurity', () => {
  it('returns null when no token address is provided', () => {
    // #given a payload missing the token_address
    const event = normalizeSecurity({ data: { is_honeypot: false } });

    // #then null is returned
    expect(event).toBeNull();
  });

  it('returns a flagged honeypot when the payload indicates one', () => {
    // #given a flagged token
    const raw = {
      data: {
        token_address: '0x1111111111111111111111111111111111111111',
        is_honeypot: true,
        owner_can_mint: true,
        risk_score: 95,
        flags: ['honeypot', 'mintable'],
      },
    };

    // #when normalized
    const event = normalizeSecurity(raw);

    // #then the flagged status is preserved
    expect(event?.isHoneypot).toBe(true);
    expect(event?.ownerCanMint).toBe(true);
    expect(event?.riskScore).toBe(95);
    expect(event?.flags).toEqual(['honeypot', 'mintable']);
  });
});

describe('normalizeSocial', () => {
  it('canonicalizes sentiment_direction to the union type', () => {
    // #given a positive-sentiment social signal
    const raw = {
      data: [{ symbol: 'cake', kol_mention_count: 12, velocity_per_hour: 4, sentiment_direction: 'Bullish' }],
    };

    // #when normalized
    const events = normalizeSocial(raw);

    // #then sentiment maps to 'positive'
    expect(events).toHaveLength(1);
    expect(events[0].sentimentDirection).toBe('positive');
    expect(events[0].tokenSymbol).toBe('CAKE');
  });
});

describe('normalizeDexLiquidity', () => {
  it('uses the fallback address when pair_address is missing', () => {
    // #given a liquidity snapshot without pair_address
    const raw = { data: [{ symbol: 'BNB', liquidity_usd: 5_000_000, volume_24h_usd: 1_000_000, price_impact_1k_usd: 0.01 }] };
    const fallback = {
      BNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as `0x${string}`,
    };

    // #when normalized
    const events = normalizeDexLiquidity(raw, fallback);

    // #then the fallback pair address is used
    expect(events).toHaveLength(1);
    expect(events[0].pairAddress).toBe(fallback.BNB);
  });
});

describe('normalizeNews', () => {
  it('handles published_at as ISO string and as number', () => {
    // #given two news items with mixed timestamp formats
    const raw = {
      data: [
        { title: 'A', url: 'https://example.com/a', published_at: '2026-06-01T12:00:00Z', sentiment: 'positive' },
        { title: 'B', url: 'https://example.com/b', published_at: 1_700_000_000_000, sentiment: 'bearish' },
      ],
    };

    // #when normalized
    const events = normalizeNews(raw);

    // #then both events parse and sentiment maps to the union
    expect(events).toHaveLength(2);
    expect(events[0].publishedAt).toBe(new Date('2026-06-01T12:00:00Z').getTime());
    expect(events[1].sentimentDirection).toBe('negative');
  });
});

describe('normalizePythDivergence', () => {
  it('computes the divergence percent from cmc vs pyth', () => {
    // #given a Pyth price fetch and a CMC price 0.5% above it
    const pyth = {
      feedId: '0xabc',
      pair: 'BNB/USD',
      priceUSD: 660.0,
      confidenceUSD: 0.1,
      publishTime: 0,
      stalenessSeconds: 0,
    };

    // #when normalized
    const event = normalizePythDivergence(pyth, 663.3, 'BNB');

    // #then the divergence is 0.5%
    expect(event.divergencePercent).toBeCloseTo(0.005, 4);
    expect(event.tokenSymbol).toBe('BNB');
  });
});
