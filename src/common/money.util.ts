/** Money is stored as numeric(12,2). Compare and add it as integer cents, never as floats. */
export function toCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
