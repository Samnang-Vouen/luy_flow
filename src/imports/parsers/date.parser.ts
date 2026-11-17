import { isValid, parse } from 'date-fns';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a statement date cell into YYYY-MM-DD, or null if it can't.
 * Excel date cells already arrive as YYYY-MM-DD; text cells are parsed with
 * the profile's date-fns format, e.g. "MMM d, yyyy" for "Oct 08, 2026".
 */
export function parseStatementDate(cell: string, format: string): string | null {
  const value = cell.trim();
  if (!value) return null;

  if (ISO_DATE.test(value)) {
    const date = parse(value, 'yyyy-MM-dd', new Date(2000, 0, 1));
    return isValid(date) ? value : null;
  }

  const date = parse(value, format, new Date(2000, 0, 1));
  if (!isValid(date)) return null;
  const yyyy = String(date.getFullYear()).padStart(4, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
