/**
 * Fetch BSC contract addresses for the 149-token competition allowlist via CMC
 * `v2/cryptocurrency/info`, then print the JSON object expected by
 * `loadAllowlistFromEnv` (`{ "SYMBOL": "0xaddress" }`).
 *
 * Usage:
 *   railway run --service neurodegen tsx scripts/buildAllowlist.ts > allowlist.json
 *
 * Notes:
 *  - Reads `CMC_PRO_API_KEY` from process env (injected by `railway run`).
 *  - Some symbols are ambiguous (e.g. `M`, `U`, `Q`, `B`) and may match
 *    multiple coins. The script keeps the BSC-platform entry with the highest
 *    CMC rank (lowest `cmc_rank` numeric value), printing diagnostics to
 *    stderr so the operator can audit.
 *  - Some "BEP-20" tokens are actually native BNB-Chain assets — for those
 *    we use WBNB as the swap proxy.
 */

import { BSC_WBNB_ADDRESS } from '../src/config/chains';

// Pulled verbatim from the hackathon brief (hack.md). 152 entries because
// the source has 3 duplicates (SLX×2, M/MY, USDf/USDF) that CMC resolves to
// distinct cmc_ids — we let CMC disambiguate.
const SYMBOLS = [
  'ETH','USDT','USDC','XRP','TRX','DOGE','ZEC','ADA','LINK','BCH','DAI','TON',
  'USD1','USDe','M','LTC','AVAX','SHIB','XAUt','WLFI','H','DOT','UNI','ASTER',
  'DEXE','USDD','ETC','AAVE','ATOM','U','STABLE','FIL','INJ','NIGHT','FET',
  'TUSD','BONK','PENGU','CAKE','SIREN','LUNC','ZRO','KITE','FDUSD','BEAT',
  'PIEVERSE','BTT','NFT','EDGE','FLOKI','LDO','B','FF','PENDLE','NEX','STG',
  'AXS','TWT','HOME','RAY','COMP','GWEI','XCN','GENIUS','XPL','BAT','SKYAI',
  'APE','IP','SFP','TAG','NXPC','AB','SAHARA','1INCH','CHEEMS','BANANAS31',
  'RIVER','MYX','RAVE','SNX','FORM','LAB','HTX','USDf','CTM','BDX','SLX',
  'UB','DUCKY','FRAX','BILL','WFI','KOGE','ALE','FRXUSD','USDF','GOMINING',
  'VCNT','GUA','DUSD','SMILEK','0G','BEAM','MY','SOON','REAL','Q','AIOZ',
  'ZIG','YFI','TAC','lisUSD','CYS','ZAMA','TRIA','HUMA','PLUME','ZIL','XPR',
  'ZETA','BabyDoge','NILA','ROSE','VELO','UAI','BRETT','OPEN','BSB','TOSHI',
  'BAS','ACH','AXL','LUR','ELF','KAVA','APR','IRYS','EURI','XUSD','BARD',
  'DUSK','SUSHI','PEAQ','COAI','BDCA','XAUM',
];

interface CmcPlatformInfo {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  token_address?: string | null;
}

interface CmcInfo {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  category: string;
  platform: CmcPlatformInfo | null;
  contract_address: Array<{
    contract_address: string;
    platform: { name: string; coin: { id: string; name: string; symbol: string; slug: string } };
  }>;
}

interface CmcInfoResponse {
  status: { error_code: number; error_message: string | null };
  data: Record<string, CmcInfo[] | CmcInfo>;
}

const CMC_BASE = 'https://pro-api.coinmarketcap.com';
const BNB_PLATFORM_NAMES = new Set([
  'BNB Smart Chain (BEP20)',
  'Binance Smart Chain',
  'BNB Chain',
  'BNB Beacon Chain (BEP2)',
]);

function isBnbPlatform(name: string): boolean {
  if (!name) return false;
  return BNB_PLATFORM_NAMES.has(name) || /BNB|BEP-?20|BEP-?2|Binance Smart Chain/i.test(name);
}

async function fetchInfo(batch: string[]): Promise<CmcInfoResponse> {
  const key = process.env.CMC_PRO_API_KEY;
  if (!key) throw new Error('CMC_PRO_API_KEY not set; run with `railway run`');
  const url = `${CMC_BASE}/v2/cryptocurrency/info?symbol=${encodeURIComponent(batch.join(','))}&aux=platform,status`;
  const res = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': key, Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`CMC ${res.status}: ${await res.text().catch(() => '')}`);
  }
  return res.json() as Promise<CmcInfoResponse>;
}

function pickBscEntry(symbol: string, entries: CmcInfo[]): { address: `0x${string}`; chosen: CmcInfo } | null {
  // Prefer entries whose `platform` is the BSC platform with a `token_address`.
  const candidates = entries.filter((e) => {
    if (e.platform && isBnbPlatform(e.platform.name) && e.platform.token_address) return true;
    if (Array.isArray(e.contract_address)) {
      return e.contract_address.some(
        (c) => isBnbPlatform(c.platform?.name ?? '') && /^0x[0-9a-fA-F]{40}$/.test(c.contract_address),
      );
    }
    return false;
  });
  if (candidates.length === 0) return null;
  // Sort by id ascending — lower CMC id usually = older/more canonical.
  candidates.sort((a, b) => a.id - b.id);
  const chosen = candidates[0]!;
  let address: string | null = null;
  if (chosen.platform && isBnbPlatform(chosen.platform.name) && chosen.platform.token_address) {
    address = chosen.platform.token_address;
  } else {
    const found = chosen.contract_address.find(
      (c) => isBnbPlatform(c.platform?.name ?? '') && /^0x[0-9a-fA-F]{40}$/.test(c.contract_address),
    );
    address = found?.contract_address ?? null;
  }
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  return { address: address as `0x${string}`, chosen };
}

async function main(): Promise<void> {
  const result: Record<string, `0x${string}`> = {};
  const missing: string[] = [];
  const native: string[] = []; // tokens that exist on BSC natively without a BEP-20 representation

  // BNB itself maps to WBNB for swap routing purposes.
  result['BNB'] = BSC_WBNB_ADDRESS;
  result['WBNB'] = BSC_WBNB_ADDRESS;

  const BATCH = 100;
  for (let i = 0; i < SYMBOLS.length; i += BATCH) {
    const batch = SYMBOLS.slice(i, i + BATCH);
    try {
      const json = await fetchInfo(batch);
      if (json.status?.error_code && json.status.error_code !== 0) {
        console.error(`[allowlist] batch error: ${json.status.error_message}`);
        continue;
      }
      for (const sym of batch) {
        const upperSym = sym.toUpperCase();
        // The response keys preserve the original symbol casing the user requested.
        const entries: CmcInfo[] = ([] as CmcInfo[]).concat(
          (json.data[sym] as CmcInfo[] | CmcInfo | undefined) ?? [],
          (json.data[upperSym] as CmcInfo[] | CmcInfo | undefined) ?? [],
        );
        if (entries.length === 0) {
          missing.push(sym);
          continue;
        }
        const picked = pickBscEntry(sym, entries);
        if (!picked) {
          // Token is on CMC but has no BSC contract — treat as native or non-BSC
          native.push(sym);
          continue;
        }
        result[upperSym] = picked.address;
      }
    } catch (err) {
      console.error(`[allowlist] fetch failed for batch ${i / BATCH}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.error(`[allowlist] resolved: ${Object.keys(result).length}`);
  console.error(`[allowlist] missing on CMC: ${missing.length}  (${missing.join(', ')})`);
  console.error(`[allowlist] no BSC contract: ${native.length}  (${native.join(', ')})`);

  process.stdout.write(JSON.stringify(result));
  process.stdout.write('\n');
}

void main().catch((err) => {
  console.error('[allowlist] fatal:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
