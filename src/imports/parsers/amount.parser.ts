import Decimal from 'decimal.js';

const NUMBER_PATTERN = /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i;



export function parseStatementAmount(
  cell: string,
  { signed = false }: { signed?: boolean } = {},
): string | null {
  const cleaned = cell
    .replace(/[\s,]/g, '')
    .replace(/^(USD|KHR|\$|៛)/i, '')
    .replace(/(USD|KHR|\$|៛)$/i, '');
  if (cleaned === '' || cleaned === '-') return null;
  if (!NUMBER_PATTERN.test(cleaned)) {
    throw new Error(`"${cell}" is not a valid amount`);
  }
  // Excel can store values like 7.2300000000000004; round to cents.
  const value = new Decimal(cleaned).toDecimalPlaces(2);
  return (signed ? value : value.abs()).toFixed(2);
}
