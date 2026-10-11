/**
 * Prisma returns `bigint` for BigInt columns. All our money values are far below
 * Number.MAX_SAFE_INTEGER, so we serialise them as plain numbers in JSON.
 * Imported once from main.ts (and from the test setup files).
 */
export function enableBigIntSerialization(): void {
  const proto = BigInt.prototype as unknown as { toJSON?: () => number };
  if (!proto.toJSON) {
    proto.toJSON = function toJSON(this: bigint) {
      return Number(this);
    };
  }
}

/** Safe bigint → number conversion for money/counters. */
export function toNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'bigint' ? Number(value) : value;
}

export function toNullableNumber(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'bigint' ? Number(value) : value;
}
