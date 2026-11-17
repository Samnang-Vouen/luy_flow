/**
 * Turns raw statement rows into import rows: mapping, validation, category /
 * payment-method suggestions, duplicate detection and the balance check.
 * Pure functions (no database), so the logic can be tested with plain data.
 */
import Decimal from 'decimal.js';
import { TransactionType } from '../transactions/entities/transaction.entity';
import type { DuplicateCheckCandidate } from '../transactions/transactions.service';
import { ruleKey } from './categorization-rules/categorization-rules.service';
import { DuplicateKind } from './entities/import-row.entity';
import type { ImportProfile } from './import-profiles/entities/import-profile.entity';
import { parseStatementAmount } from './parsers/amount.parser';
import { parseStatementDate } from './parsers/date.parser';
import { parseDetails } from './parsers/details.parser';

export interface AnalysisContext {
  accountCurrency: string;
  profile: Pick<
    ImportProfile,
    'columns' | 'dateFormat' | 'headerRows' | 'channelPaymentMethods'
  >;
  /** Active (non-archived) categories of the user: id -> type. */
  categoryTypes: Map<string, string>;
  /** Active (non-archived) payment method ids of the user. */
  paymentMethodIds: Set<string>;
  /** Learned rules: ruleKey(type, counterparty) -> categoryId. */
  rules: Map<string, string>;
}

export interface DraftRow {
  rowNumber: number;
  cells: string[];
  errors: string[];
  warnings: string[];
  date: string | null;
  type: TransactionType | null;
  amount: string | null;
  balance: string | null;
  description: string | null;
  counterparty: string | null;
  channel: string | null;
  externalRef: string | null;
  rawDetails: string | null;
  categoryId: string | null;
  paymentMethodId: string | null;
  duplicateKind: DuplicateKind | null;
  duplicateOfTransactionId: string | null;
}

/** Maps and validates every data row. Blank rows (no date and no amounts) are skipped. */
export function extractRows(rows: string[][], ctx: AnalysisContext): DraftRow[] {
  const { columns, dateFormat, headerRows, channelPaymentMethods } = ctx.profile;
  const drafts: DraftRow[] = [];

  rows.slice(headerRows).forEach((cells, index) => {
    const cell = (i: number | null | undefined) =>
      i === null || i === undefined ? '' : (cells[i] ?? '').trim();

    const dateCell = cell(columns.date);
    const inCell = cell(columns.moneyIn);
    const outCell = cell(columns.moneyOut);
    if (!dateCell && !inCell && !outCell) return;

    const draft: DraftRow = {
      rowNumber: headerRows + index + 1,
      cells,
      errors: [],
      warnings: [],
      date: null,
      type: null,
      amount: null,
      balance: null,
      description: null,
      counterparty: null,
      channel: null,
      externalRef: null,
      rawDetails: null,
      categoryId: null,
      paymentMethodId: null,
      duplicateKind: null,
      duplicateOfTransactionId: null,
    };

    draft.date = parseStatementDate(dateCell, dateFormat);
    if (!draft.date) {
      draft.errors.push(`Invalid date "${dateCell}" (expected ${dateFormat})`);
    }

    const moneyIn = tryAmount(inCell, 'Money In', draft.errors);
    const moneyOut = tryAmount(outCell, 'Money Out', draft.errors);
    // "0.00" counts as empty: banks fill the unused column with zero.
    const positiveIn = isPositive(moneyIn) ? moneyIn : null;
    const positiveOut = isPositive(moneyOut) ? moneyOut : null;
    if (positiveIn && positiveOut) {
      draft.errors.push('Both Money In and Money Out have a value');
    } else if (positiveIn) {
      draft.type = TransactionType.INCOME;
      draft.amount = positiveIn;
    } else if (positiveOut) {
      draft.type = TransactionType.EXPENSE;
      draft.amount = positiveOut;
    } else if (moneyIn !== undefined && moneyOut !== undefined) {
      draft.errors.push('Neither Money In nor Money Out has a value');
    }

    for (const i of columns.currencies ?? []) {
      const currency = cell(i).toUpperCase();
      if (currency && currency !== ctx.accountCurrency) {
        draft.errors.push(
          `Currency ${currency} does not match the account currency ${ctx.accountCurrency}`,
        );
        break;
      }
    }

    if (columns.balance !== null && columns.balance !== undefined) {
      const balance = tryAmount(cell(columns.balance), 'Balance', draft.errors, true);
      draft.balance = balance ?? null;
    }

    const rawDetails = cell(columns.details);
    if (rawDetails) {
      const details = parseDetails(rawDetails);
      draft.rawDetails = rawDetails;
      draft.description = details.description?.slice(0, 255) ?? null;
      draft.counterparty = details.counterparty?.slice(0, 120) ?? null;
      draft.channel = details.channel;
      draft.externalRef = details.externalRef?.slice(0, 64) ?? null;

      if (
        draft.amount &&
        details.originalAmount &&
        details.originalCurrency === ctx.accountCurrency &&
        !new Decimal(details.originalAmount).eq(draft.amount)
      ) {
        draft.warnings.push(
          `Amount ${draft.amount} differs from ORIGINAL AMOUNT ${details.originalAmount} in the details`,
        );
      }

      const mappedPaymentMethod =
        (details.isKhqr ? channelPaymentMethods.KHQR : undefined) ??
        (details.channel ? channelPaymentMethods[details.channel] : undefined);
      if (mappedPaymentMethod && ctx.paymentMethodIds.has(mappedPaymentMethod)) {
        draft.paymentMethodId = mappedPaymentMethod;
      }
    }

    if (draft.counterparty && draft.type) {
      const categoryId = ctx.rules.get(ruleKey(draft.type, draft.counterparty));
      if (categoryId && ctx.categoryTypes.get(categoryId) === draft.type) {
        draft.categoryId = categoryId;
      }
    }

    drafts.push(draft);
  });

  return drafts;
}

/**
 * Marks duplicates:
 * - REFERENCE: the bank reference already exists on the account, or appears
 *   earlier in this file. These can never be imported.
 * - FINGERPRINT: same date, type and amount as an existing transaction that
 *   has no bank reference (e.g. entered manually). The user decides.
 * Real repeats (two identical coffees on one day) are counted, so the 2nd
 * file row only matches if there are 2 existing transactions.
 */
export function markDuplicates(
  drafts: DraftRow[],
  existingRefs: Set<string>,
  candidates: DuplicateCheckCandidate[],
): void {
  const firstRowByRef = new Map<string, number>();
  const existingByFingerprint = new Map<string, string[]>();
  for (const c of candidates) {
    if (c.externalRef) continue;
    const key = fingerprint(c.date, c.type, c.amount);
    existingByFingerprint.set(key, [...(existingByFingerprint.get(key) ?? []), c.id]);
  }
  const seenFingerprints = new Map<string, number>();

  for (const draft of drafts) {
    if (draft.errors.length > 0) continue;

    if (draft.externalRef) {
      if (existingRefs.has(draft.externalRef)) {
        draft.duplicateKind = DuplicateKind.REFERENCE;
        draft.warnings.push('This bank reference was already imported');
        continue;
      }
      const firstRow = firstRowByRef.get(draft.externalRef);
      if (firstRow !== undefined) {
        draft.duplicateKind = DuplicateKind.REFERENCE;
        draft.warnings.push(`Same bank reference as row ${firstRow} in this file`);
        continue;
      }
      firstRowByRef.set(draft.externalRef, draft.rowNumber);
    }

    const key = fingerprint(draft.date!, draft.type!, draft.amount!);
    const occurrence = (seenFingerprints.get(key) ?? 0) + 1;
    seenFingerprints.set(key, occurrence);
    const matches = existingByFingerprint.get(key) ?? [];
    if (occurrence <= matches.length) {
      draft.duplicateKind = DuplicateKind.FINGERPRINT;
      draft.duplicateOfTransactionId = matches[occurrence - 1];
      draft.warnings.push(
        'Possible duplicate: a transaction with the same date, type and amount already exists',
      );
    }
  }
}

/**
 * Checks that each balance follows from the previous row
 * (previous balance + money in - money out). Detects whether the file is
 * oldest-first or newest-first. Returns the statement's opening and closing
 * balance in chronological order.
 */
export function checkBalances(drafts: DraftRow[]): {
  opening: string | null;
  closing: string | null;
} {
  const seq = drafts.filter(
    (d) => d.errors.length === 0 && d.balance !== null && d.amount && d.type,
  );
  if (seq.length === 0) return { opening: null, closing: null };

  const delta = (d: DraftRow) =>
    d.type === TransactionType.INCOME
      ? new Decimal(d.amount!)
      : new Decimal(d.amount!).neg();
  const balance = (d: DraftRow) => new Decimal(d.balance!);

  const ascMismatches: DraftRow[] = [];
  const descMismatches: DraftRow[] = [];
  for (let i = 1; i < seq.length; i++) {
    const [prev, curr] = [seq[i - 1], seq[i]];
    if (!balance(prev).plus(delta(curr)).eq(balance(curr))) ascMismatches.push(curr);
    if (!balance(curr).plus(delta(prev)).eq(balance(prev))) descMismatches.push(prev);
  }

  const newestFirst = descMismatches.length < ascMismatches.length;
  const mismatches = newestFirst ? descMismatches : ascMismatches;
  for (const row of mismatches) {
    row.warnings.push(
      'Balance does not follow from the previous row: a row may be missing or misread',
    );
  }

  const first = newestFirst ? seq[seq.length - 1] : seq[0];
  const last = newestFirst ? seq[0] : seq[seq.length - 1];
  return {
    opening: balance(first).minus(delta(first)).toFixed(2),
    closing: balance(last).toFixed(2),
  };
}

function isPositive(amount: string | null | undefined): amount is string {
  return typeof amount === 'string' && new Decimal(amount).gt(0);
}

function fingerprint(date: string, type: string, amount: string) {
  return `${date}|${type}|${new Decimal(amount).toFixed(2)}`;
}

/** Parses an amount cell; records an error and returns undefined if invalid. */
function tryAmount(
  value: string,
  label: string,
  errors: string[],
  signed = false,
): string | null | undefined {
  try {
    return parseStatementAmount(value, { signed });
  } catch {
    errors.push(`${label} "${value}" is not a valid amount`);
    return undefined;
  }
}
