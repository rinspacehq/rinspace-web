/** Exact wallet arithmetic, independent of UI, network and unapproved limits. */
export const MAX_WALLET_INTEGER = 9223372036854775807n;

function checked(value: bigint): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > MAX_WALLET_INTEGER) {
    throw new RangeError('Wallet integer out of range');
  }
  return value;
}

export function parseWalletInteger(raw: unknown): bigint {
  if (typeof raw !== 'string' || raw !== raw.trim() || raw.length > 19 || !/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new TypeError('Invalid canonical wallet integer');
  }
  return checked(BigInt(raw));
}

export function parsePositiveWalletInteger(raw: unknown): bigint {
  const value = parseWalletInteger(raw);
  if (value === 0n) throw new RangeError('Wallet transaction must be positive');
  return value;
}

export function walletIntegerString(value: bigint): string {
  return checked(value).toString();
}

export function addWalletIntegers(left: bigint, right: bigint): bigint {
  return checked(checked(left) + checked(right));
}

export function subtractWalletIntegers(left: bigint, right: bigint): bigint {
  return checked(checked(left) - checked(right));
}

export function multiplyWalletIntegers(left: bigint, right: bigint): bigint {
  return checked(checked(left) * checked(right));
}

/** Payment adapter / yuan input grammar, not the canonical integer API grammar. */
export function parseYuanToFen(raw: unknown): bigint {
  if (typeof raw !== 'string' || raw !== raw.trim() || raw.length > 22 || !/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(raw)) {
    throw new TypeError('Invalid decimal yuan amount');
  }
  const [whole, fraction = ''] = raw.split('.');
  return addWalletIntegers(
    multiplyWalletIntegers(parseWalletInteger(whole), 100n),
    BigInt(fraction.padEnd(2, '0')),
  );
}

export function formatFenAsYuan(fen: bigint): string {
  checked(fen);
  return `${fen / 100n}.${(fen % 100n).toString().padStart(2, '0')}`;
}

function positiveGroup(value: bigint): bigint {
  checked(value);
  if (value === 0n || value % 10n !== 0n) {
    throw new RangeError('Wallet amount must be a positive group of ten');
  }
  return value / 10n;
}

export function rechargeShangong(fen: bigint): bigint {
  return positiveGroup(fen);
}

export function convertBoundShangong(bound: bigint): bigint {
  return positiveGroup(bound) * 7n;
}

/** Pricing only. Refund eligibility and manual approval are server obligations. */
export function refundFen(shangong: bigint): bigint {
  checked(shangong);
  if (shangong === 0n) throw new RangeError('Wallet transaction must be positive');
  return multiplyWalletIntegers(shangong, 10n);
}
