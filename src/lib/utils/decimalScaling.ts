const COLLATERAL_SCALE = 10n ** 18n;
const PRICE_SCALE = 10n ** 30n;

export function toCollateralScale(usdAmount: number): bigint {
  if (usdAmount === 0) return 0n;
  const isNegative = usdAmount < 0;
  const abs = Math.abs(usdAmount);
  const wholePart = BigInt(Math.floor(abs));
  const fractionalPart = BigInt(Math.round((abs - Math.floor(abs)) * 1e12));
  const scaled = wholePart * COLLATERAL_SCALE + fractionalPart * (COLLATERAL_SCALE / 10n ** 12n);
  return isNegative ? -scaled : scaled;
}

export function toPriceScale(usdPrice: number): bigint {
  if (usdPrice === 0) return 0n;
  const isNegative = usdPrice < 0;
  const abs = Math.abs(usdPrice);
  const wholePart = BigInt(Math.floor(abs));
  const fractionalPart = BigInt(Math.round((abs - Math.floor(abs)) * 1e12));
  const scaled = wholePart * PRICE_SCALE + fractionalPart * (PRICE_SCALE / 10n ** 12n);
  return isNegative ? -scaled : scaled;
}

export function fromCollateralScale(scaled: bigint): number {
  if (scaled === 0n) return 0;
  const isNegative = scaled < 0n;
  const abs = isNegative ? -scaled : scaled;
  const wholePart = abs / COLLATERAL_SCALE;
  const remainder = abs % COLLATERAL_SCALE;
  const fractional = Number(remainder) / Number(COLLATERAL_SCALE);
  const result = Number(wholePart) + fractional;
  return isNegative ? -result : result;
}

export function fromPriceScale(scaled: bigint): number {
  if (scaled === 0n) return 0;
  const isNegative = scaled < 0n;
  const abs = isNegative ? -scaled : scaled;
  const wholePart = abs / PRICE_SCALE;
  const remainder = abs % PRICE_SCALE;
  const fractional = Number(remainder) / Number(PRICE_SCALE);
  const result = Number(wholePart) + fractional;
  return isNegative ? -result : result;
}
