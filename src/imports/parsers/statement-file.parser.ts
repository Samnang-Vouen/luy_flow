import { parse as parseCsv } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';

export type StatementFileType = 'csv' | 'xlsx';

/** A problem with the uploaded file itself (wrong format, unreadable). Maps to HTTP 400. */
export class StatementFileError extends Error {}

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // ZIP container ("PK\x03\x04")
const XLS_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // legacy binary Excel (OLE2)

function startsWith(buffer: Buffer, magic: number[]) {
  return magic.every((byte, i) => buffer[i] === byte);
}

export function detectStatementFileType(
  buffer: Buffer,
  fileName: string,
): StatementFileType {
  if (startsWith(buffer, XLS_MAGIC)) {
    throw new StatementFileError(
      'Old .xls files are not supported. Open the file in Excel and save it as .xlsx or CSV.',
    );
  }
  if (startsWith(buffer, XLSX_MAGIC)) return 'xlsx';
  if (/\.xlsx$/i.test(fileName)) {
    throw new StatementFileError('The file is not a valid .xlsx file.');
  }
  if (/\.csv$/i.test(fileName) || !buffer.subarray(0, 512).includes(0)) {
    return 'csv';
  }
  throw new StatementFileError('Unsupported file type. Upload a .csv or .xlsx file.');
}

/**
 * Reads the first sheet (Excel) or the whole file (CSV) into rows of trimmed
 * strings. Excel date cells become YYYY-MM-DD; numbers keep their raw text so
 * amounts never pass through floating point.
 */
export async function readStatementRows(
  buffer: Buffer,
  fileName: string,
): Promise<{ type: StatementFileType; rows: string[][] }> {
  const type = detectStatementFileType(buffer, fileName);

  if (type === 'csv') {
    try {
      const rows = parseCsv(buffer, {
        bom: true,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      }) as string[][];
      return { type, rows };
    } catch (err) {
      throw new StatementFileError(`Could not read CSV: ${(err as Error).message}`);
    }
  }

  try {
    const sheet = await readSheet<string>(buffer, {
      parseNumber: (raw) => raw,
      trim: true,
    });
    const rows = sheet.map((row) => row.map(cellToString));
    return { type, rows };
  } catch (err) {
    throw new StatementFileError(
      `Could not read Excel file: ${(err as Error).message}`,
    );
  }
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}
