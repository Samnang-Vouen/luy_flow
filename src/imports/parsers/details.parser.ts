/**
 * Parses the bank's "Transaction Details" text, e.g.
 *
 *   PAYMENT FROM <SENDER> <ACCOUNT NO> BANK <SWIFT> ORIGINAL AMOUNT 7.00 USD
 *   AT <ACCOUNT HOLDER> ON Oct 08, 2026 08:19 AM REMARK: NONUNICODE-…
 *   KHQR|APV:|Purchase #: REF# 100FT39262607030 TRAN# HASH# 2e89490d
 *
 * Fields appear in different orders per row type, so each one is found by
 * its own keyword instead of one regex for the whole line.
 */

export const DETAIL_CHANNELS = [
  'PAYMENT_FROM',
  'FUNDS_RECEIVED',
  'FUNDS_TRANSFERRED',
  'CARD_PURCHASE',
  'PURCHASE',
  'E_CASH_QR',
] as const;
export type DetailChannel = (typeof DETAIL_CHANNELS)[number];

/** Keys an import profile can map to a payment method. */
export const PAYMENT_METHOD_MAPPING_KEYS = ['KHQR', ...DETAIL_CHANNELS] as const;
export type PaymentMethodMappingKey = (typeof PAYMENT_METHOD_MAPPING_KEYS)[number];

export interface ParsedDetails {
  channel: DetailChannel | null;
  /** Merchant or sender, as written by the bank (upper case). */
  counterparty: string | null;
  /** Clean, human-readable text for transaction.description. */
  description: string | null;
  /** e.g. "Oct 08, 2026 08:19 AM" */
  occurredAt: string | null;
  originalAmount: string | null;
  originalCurrency: string | null;
  remark: string | null;
  externalRef: string | null;
  isKhqr: boolean;
}

const DATE_TIME = String.raw`[A-Z][a-z]{2} \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M`;
// Markers that end a free-text field (merchant name, remark).
const STOP = String.raw`(?= ON ${DATE_TIME}| ORIGINAL AMOUNT | AT | REMARK:| KHQR\|| REF#| TRAN#| HASH#| PURCHASE ?#| Purchase ?#| APV|$)`;

const CHANNEL_RULES: {
  channel: DetailChannel;
  pattern: RegExp;
  label: string;
}[] = [
  {
    channel: 'PAYMENT_FROM',
    // "PAYMENT FROM <sender> <account no> BANK <bank name or SWIFT> ..."
    // The sender ends at the account number; the bank name can be several words.
    pattern: /^PAYMENT FROM (.+?)(?= \d{6,}| BANK | ORIGINAL AMOUNT| AT | ON |$)/,
    label: 'Payment from',
  },
  {
    channel: 'FUNDS_RECEIVED',
    // "FUNDS RECEIVED FROM <sender> (008 857 319) ORIGINAL AMOUNT ..."
    pattern:
      /^FUNDS RECEIVED FROM (.+?)(?= \(| \d{6,}| ORIGINAL AMOUNT| REF#| ON |$)/,
    label: 'Received from',
  },
  {
    channel: 'FUNDS_TRANSFERRED',
    // "FUNDS TRANSFERRED TO <recipient> 010641971 ORIGINAL AMOUNT ..."
    pattern:
      /^FUNDS TRANSFERRED TO (.+?)(?= \(| \d{6,}| ORIGINAL AMOUNT| REF#| ON |$)/,
    label: 'Transfer to',
  },
  {
    channel: 'CARD_PURCHASE',
    // Card (e.g. VISA) payment: "PURCHASE AT <MERCHANT>,<SITE>,<COUNTRY> ... BY <holder> CARD# 402645xxxxxx9674 ..."
    // Must come before PURCHASE. The merchant ends at the first comma.
    pattern: /^PURCHASE AT (?=.* CARD# )(.+?)(?=,|-No:| BY | UNITED STATES)/,
    label: 'Card purchase at',
  },
  {
    channel: 'PURCHASE',
    pattern: new RegExp(String.raw`^PURCHASE AT (.+?)${STOP}`),
    label: 'Purchase at',
  },
  { channel: 'E_CASH_QR', pattern: /^E-CASH QR()/, label: 'QR payment' },
];

const OCCURRED_AT = new RegExp(String.raw`\bON (${DATE_TIME})`);
const ORIGINAL_AMOUNT = /ORIGINAL AMOUNT ([\d,]+(?:\.\d+)?) ([A-Z]{3})/;
const REMARK = new RegExp(String.raw`REMARK:\s*(.*?)\s*${STOP}`);
const EXTERNAL_REF = /REF#\s*(\w+)/;
// Card payments have no REF#; the card network's retrieval reference number is unique instead.
const CARD_RRN = /RRN#\s*(\d+)/;
// The bank writes this when the payer's note contained Khmer text.
const UNREADABLE_REMARK = /^NONUNICODE-/;

export function parseDetails(raw: string): ParsedDetails {
  const text = raw.replace(/\s+/g, ' ').trim();

  let channel: DetailChannel | null = null;
  let counterparty: string | null = null;
  let label: string | null = null;
  for (const rule of CHANNEL_RULES) {
    const match = text.match(rule.pattern);
    if (match) {
      channel = rule.channel;
      counterparty = match[1]?.trim() || null;
      label = rule.label;
      break;
    }
  }

  const original = text.match(ORIGINAL_AMOUNT);
  const remark = text.match(REMARK)?.[1]?.trim() || null;

  return {
    channel,
    counterparty,
    description: label
      ? counterparty
        ? `${label} ${toTitleCase(counterparty)}`
        : label
      : null,
    occurredAt: text.match(OCCURRED_AT)?.[1] ?? null,
    originalAmount: original ? original[1].replace(/,/g, '') : null,
    originalCurrency: original?.[2] ?? null,
    remark: remark && !UNREADABLE_REMARK.test(remark) ? remark : null,
    externalRef: externalRefOf(text),
    isKhqr: /\bKHQR\b/.test(text),
  };
}

function externalRefOf(text: string): string | null {
  const ref = text.match(EXTERNAL_REF)?.[1];
  if (ref) return ref;
  const rrn = text.match(CARD_RRN)?.[1];
  return rrn ? `RRN-${rrn}` : null;
}

/** Key used to remember "this counterparty → this category". */
export function normalizeCounterparty(counterparty: string): string {
  return counterparty.replace(/\s+/g, ' ').trim().toUpperCase();
}

function toTitleCase(text: string) {
  return text
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
