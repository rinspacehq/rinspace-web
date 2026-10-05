/** Wallet boundaries accept plain data only; never invoke accessors. */
export function objectFields(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid wallet object');
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Invalid wallet object');
  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !allowed.includes(key) || !property?.enumerable || !('value' in property)) {
      throw new TypeError('Invalid wallet field');
    }
  }
  // Shape is narrowed to own data properties; individual values stay unknown.
  return value as Record<string, unknown>;
}

export function exactFields(value: unknown, required: readonly string[]): Record<string, unknown> {
  const fields = objectFields(value, required);
  if (Object.keys(fields).length !== required.length) throw new TypeError('Missing wallet fields');
  return fields;
}

export function reasonText(value: unknown): string {
  if (typeof value !== 'string' || /^\p{White_Space}*$/u.test(value)
    || [...value].length > 1000 || /\p{Cc}|\uFFFD|[\uD800-\uDFFF]/u.test(value)) {
    throw new TypeError('Invalid wallet reason');
  }
  return value;
}

export function walletUUID(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
    || value === '00000000-0000-0000-0000-000000000000') throw new TypeError('Invalid wallet UUID');
  return value;
}
