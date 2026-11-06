import { describe, expect, it } from '@jest/globals';
import {
  formatEuroCents,
  formatIban,
  isValidBic,
  isValidIban,
  parseEpc,
  parseEpcAmount,
} from '../src/tools/epc';
import { classifyBarcode, normalizeBarcodeType, parseWifi, toScannedCode, urlHasUserInfo, urlHost } from '../src/tools/barcode';

const epc = (lines: string[], sep = '\n') => lines.join(sep);

const VALID_002 = epc([
  'BCD',
  '002',
  '1',
  'SCT',
  'COBADEFFXXX',
  'Stadtwerke Musterstadt',
  'DE89 3704 0044 0532 0130 00',
  'EUR123.45',
  'GDDS',
  '',
  'Rechnung 2026-11 Kd-Nr. 4711',
]);

describe('EPC / GiroCode parser', () => {
  it('parses a complete version 002 payload', () => {
    const r = parseEpc(VALID_002);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payment).toEqual({
      version: '002',
      characterSet: 1,
      bic: 'COBADEFFXXX',
      name: 'Stadtwerke Musterstadt',
      iban: 'DE89370400440532013000',
      amountCents: 12345,
      purpose: 'GDDS',
      reference: null,
      text: 'Rechnung 2026-11 Kd-Nr. 4711',
      information: null,
    });
  });

  it('accepts CRLF line endings, omitted trailing lines, no BIC and no amount in 002', () => {
    const r = parseEpc(epc(['BCD', '002', '1', 'SCT', '', 'Max Mustermann', 'DE89370400440532013000'], '\r\n'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payment.bic).toBeNull();
    expect(r.payment.amountCents).toBeNull();
    expect(r.payment.text).toBeNull();
  });

  it('accepts a structured reference and umlauts in the name', () => {
    const r = parseEpc(epc(['BCD', '002', '1', 'SCT', '', 'Müller & Söhne GmbH', 'DE89370400440532013000', 'EUR5', '', 'RF18539007547034']));
    expect(r.ok && r.payment.reference).toBe('RF18539007547034');
    expect(r.ok && r.payment.name).toBe('Müller & Söhne GmbH');
    expect(r.ok && r.payment.amountCents).toBe(500);
  });

  it('requires the BIC in version 001', () => {
    expect(parseEpc(epc(['BCD', '001', '1', 'SCT', '', 'X', 'DE89370400440532013000']))).toEqual({ ok: false, error: 'missing_bic' });
  });

  it('rejects malformed payloads with a specific error', () => {
    const base = ['BCD', '002', '1', 'SCT', 'COBADEFFXXX', 'Name', 'DE89370400440532013000', 'EUR1.00'];
    const withField = (i: number, v: string) => epc(base.map((x, j) => (j === i ? v : x)));
    expect(parseEpc('hello')).toEqual({ ok: false, error: 'not_epc' });
    expect(parseEpc(withField(1, '003'))).toEqual({ ok: false, error: 'unsupported_version' });
    expect(parseEpc(withField(2, '9'))).toEqual({ ok: false, error: 'unsupported_charset' });
    expect(parseEpc(withField(3, 'INST'))).toEqual({ ok: false, error: 'unsupported_identification' });
    expect(parseEpc(withField(4, 'XX'))).toEqual({ ok: false, error: 'invalid_bic' });
    expect(parseEpc(withField(5, ''))).toEqual({ ok: false, error: 'missing_name' });
    expect(parseEpc(withField(6, 'DE89370400440532013001'))).toEqual({ ok: false, error: 'invalid_iban' });
    expect(parseEpc(withField(7, 'USD1.00'))).toEqual({ ok: false, error: 'invalid_amount' });
    expect(parseEpc(withField(7, 'EUR0.00'))).toEqual({ ok: false, error: 'invalid_amount' });
    expect(parseEpc(withField(7, 'EUR1,50'))).toEqual({ ok: false, error: 'invalid_amount' });
    expect(parseEpc([...base, 'TOOLONG'].join('\n'))).toEqual({ ok: false, error: 'invalid_purpose' });
    expect(parseEpc([...base, '', 'RF18539007547034', 'Text'].join('\n'))).toEqual({ ok: false, error: 'reference_and_text' });
    expect(parseEpc([...base, '', '', 'x'.repeat(400)].join('\n'))).toEqual({ ok: false, error: 'too_long' });
  });

  it('validates IBANs and BICs', () => {
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(isValidIban('AT611904300234573201')).toBe(true);
    expect(isValidIban('CH9300762011623852957')).toBe(true);
    expect(isValidIban('DE00370400440532013000')).toBe(false);
    expect(isValidIban('DE8937040044')).toBe(false);
    expect(isValidIban('')).toBe(false);
    expect(isValidBic('COBADEFF')).toBe(true);
    expect(isValidBic('COBADEFFXXX')).toBe(true);
    expect(isValidBic('COBADE')).toBe(false);
  });

  it('parses and formats amounts and IBANs', () => {
    expect(parseEpcAmount('EUR12.5')).toBe(1250);
    expect(parseEpcAmount('EUR999999999.99')).toBe(99999999999);
    expect(parseEpcAmount('EUR')).toBeNull();
    expect(formatEuroCents(123456, 'de')).toBe('1.234,56 €');
    expect(formatEuroCents(5, 'en')).toBe('€0.05');
    expect(formatIban('de89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });
});

describe('barcode classification', () => {
  it('classifies URLs with host and never treats other schemes as links', () => {
    expect(classifyBarcode('https://example.com/a?b=1')).toEqual({ kind: 'url', url: 'https://example.com/a?b=1', host: 'example.com' });
    expect(classifyBarcode('javascript:alert(1)')).toEqual({ kind: 'text', text: 'javascript:alert(1)' });
    expect(classifyBarcode('ftp://example.com')).toEqual({ kind: 'text', text: 'ftp://example.com' });
    expect(urlHost('https://user:pw@bank.de:8443/x')).toBe('bank.de');
    expect(urlHasUserInfo('https://sparkasse.de@evil.example/')).toBe(true);
    expect(urlHasUserInfo('https://sparkasse.de/')).toBe(false);
  });

  it('classifies e-mail, phone, Wi-Fi, EPC and plain text', () => {
    expect(classifyBarcode('mailto:info@example.com?subject=Hi')).toMatchObject({ kind: 'email', address: 'info@example.com' });
    expect(classifyBarcode('info@example.com')).toMatchObject({ kind: 'email', url: 'mailto:info@example.com' });
    expect(classifyBarcode('tel:+49 (30) 123-456')).toEqual({ kind: 'phone', number: '+4930123456', url: 'tel:+4930123456' });
    expect(classifyBarcode('WIFI:T:WPA;S:Home\\;Net;P:pa\\:ss;;')).toEqual({
      kind: 'wifi',
      wifi: { ssid: 'Home;Net', password: 'pa:ss', security: 'WPA', hidden: false },
    });
    expect(classifyBarcode(VALID_002).kind).toBe('epc');
    expect(classifyBarcode('BCD\n009\n1\nSCT')).toEqual({ kind: 'epc_invalid', error: 'unsupported_version' });
    expect(classifyBarcode('4006381333931')).toEqual({ kind: 'text', text: '4006381333931' });
  });

  it('parses Wi-Fi edge cases', () => {
    expect(parseWifi('WIFI:S:Open;T:nopass;;')).toEqual({ ssid: 'Open', password: null, security: 'nopass', hidden: false });
    expect(parseWifi('WIFI:S:Hidden;H:true;P:x')).toMatchObject({ ssid: 'Hidden', hidden: true, password: 'x', security: 'nopass' });
    expect(parseWifi('WIFI:T:WPA;;')).toBeNull();
    expect(parseWifi('hello')).toBeNull();
  });

  it('normalizes symbology names and clips very long payloads', () => {
    expect(normalizeBarcodeType('org.iso.QRCode')).toBe('qr');
    expect(normalizeBarcodeType('ean13')).toBe('ean13');
    expect(normalizeBarcodeType(undefined)).toBe('unknown');
    const long = toScannedCode('a'.repeat(10000), 'qr');
    expect(long.raw.length).toBe(4096);
    expect(long.type).toBe('qr');
  });
});
