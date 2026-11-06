/**
 * EPC QR code ("GiroCode") parser – European Payments Council guideline
 * EPC069-12 (versions 001 and 002, SEPA Credit Transfer).
 *
 * Pure TypeScript (no React / Expo imports), unit-tested in
 * `__tests__/barcode.test.ts`. The parser never "pays" anything: it only
 * extracts the fields so the user can copy them into their banking app.
 *
 * Payload (one field per line, LF or CRLF, trailing empty lines may be omitted):
 *  1 Service tag            "BCD"
 *  2 Version                "001" | "002"
 *  3 Character set          1..8 (1 = UTF-8, 2 = ISO 8859-1, …)
 *  4 Identification         "SCT"
 *  5 BIC                    8 or 11 chars (mandatory in 001, optional in 002)
 *  6 Beneficiary name       max 70
 *  7 IBAN                   max 34
 *  8 Amount                 "EUR" + 0.01 … 999999999.99 (optional)
 *  9 Purpose code           4 chars (optional)
 * 10 Structured reference   max 35 (optional; either 10 or 11)
 * 11 Unstructured text      max 140 (optional)
 * 12 Beneficiary-to-originator information, max 70 (optional)
 */

export interface EpcPayment {
  version: '001' | '002';
  /** Character set code (1 = UTF-8). */
  characterSet: number;
  bic: string | null;
  name: string;
  /** IBAN without spaces, upper case. */
  iban: string;
  /** Amount in euro cents, null when the code leaves the amount open. */
  amountCents: number | null;
  purpose: string | null;
  /** Structured creditor reference (e.g. RF18…). */
  reference: string | null;
  /** Unstructured remittance text ("Verwendungszweck"). */
  text: string | null;
  /** Beneficiary-to-originator information. */
  information: string | null;
}

export type EpcParseError =
  | 'not_epc'
  | 'unsupported_version'
  | 'unsupported_charset'
  | 'unsupported_identification'
  | 'missing_bic'
  | 'invalid_bic'
  | 'missing_name'
  | 'invalid_iban'
  | 'invalid_amount'
  | 'invalid_purpose'
  | 'reference_and_text'
  | 'too_long';

export type EpcParseResult = { ok: true; payment: EpcPayment } | { ok: false; error: EpcParseError };

/** Maximum payload size per EPC069-12. */
export const EPC_MAX_BYTES = 331;

/** Quick check whether a scanned payload claims to be an EPC QR code. */
export function looksLikeEpc(raw: string): boolean {
  return /^\s*BCD\r?\n/.test(raw);
}

/** ISO 13616 IBAN check (country code, length 15..34, mod-97 = 1). */
export function isValidIban(input: string): boolean {
  const iban = input.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const digits = code >= 65 ? String(code - 55) : ch;
    for (const d of digits) {
      remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder === 1;
}

/** BIC / SWIFT code: 4 bank + 2 country + 2 location (+ 3 branch). */
export function isValidBic(input: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(input.toUpperCase());
}

/** Groups an IBAN in blocks of four for display ("DE89 3704 0044 …"). */
export function formatIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}

/** Parses "EUR12.5" / "EUR12.50" / "EUR1" into cents; null for invalid values. */
export function parseEpcAmount(field: string): number | null {
  const m = /^EUR(\d{1,9})(?:\.(\d{1,2}))?$/.exec(field.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
  if (cents < 1 || cents > 99999999999) return null;
  return cents;
}

/** Formats cents as a localized euro amount ("12,30 €" / "€12.30"). */
export function formatEuroCents(cents: number, locale: 'de' | 'en'): string {
  const euros = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, '0');
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, locale === 'de' ? '.' : ',');
  return locale === 'de' ? `${grouped},${rest} €` : `€${grouped}.${rest}`;
}

function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

const opt = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
};

export function parseEpc(raw: string): EpcParseResult {
  if (!looksLikeEpc(raw)) return { ok: false, error: 'not_epc' };
  if (utf8Length(raw.trim()) > EPC_MAX_BYTES) return { ok: false, error: 'too_long' };

  const lines = raw.replace(/^\s+/, '').split(/\r?\n/);
  const field = (i: number) => lines[i] ?? '';

  const version = field(1).trim();
  if (version !== '001' && version !== '002') return { ok: false, error: 'unsupported_version' };

  const characterSet = Number(field(2).trim());
  if (!Number.isInteger(characterSet) || characterSet < 1 || characterSet > 8) {
    return { ok: false, error: 'unsupported_charset' };
  }
  if (field(3).trim() !== 'SCT') return { ok: false, error: 'unsupported_identification' };

  const bicRaw = opt(field(4));
  if (!bicRaw && version === '001') return { ok: false, error: 'missing_bic' };
  if (bicRaw && !isValidBic(bicRaw)) return { ok: false, error: 'invalid_bic' };

  const name = opt(field(5));
  if (!name || name.length > 70) return { ok: false, error: 'missing_name' };

  const iban = field(6).replace(/\s+/g, '').toUpperCase();
  if (!isValidIban(iban)) return { ok: false, error: 'invalid_iban' };

  const amountRaw = opt(field(7));
  let amountCents: number | null = null;
  if (amountRaw) {
    amountCents = parseEpcAmount(amountRaw);
    if (amountCents === null) return { ok: false, error: 'invalid_amount' };
  }

  const purpose = opt(field(8));
  if (purpose && !/^[A-Z0-9]{1,4}$/i.test(purpose)) return { ok: false, error: 'invalid_purpose' };

  const reference = opt(field(9));
  const text = opt(field(10));
  if (reference && text) return { ok: false, error: 'reference_and_text' };

  return {
    ok: true,
    payment: {
      version,
      characterSet,
      bic: bicRaw ? bicRaw.toUpperCase() : null,
      name,
      iban,
      amountCents,
      purpose: purpose ? purpose.toUpperCase() : null,
      reference: reference ? reference.slice(0, 35) : null,
      text: text ? text.slice(0, 140) : null,
      information: opt(field(11)),
    },
  };
}
