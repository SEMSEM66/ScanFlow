/**
 * Classification of scanned QR / barcode payloads (Werkzeuge → QR-Scanner).
 *
 * Pure TypeScript, unit-tested in `__tests__/barcode.test.ts`.
 * Safety rule: nothing is ever opened automatically. The UI shows the full
 * value and asks before opening a link (only http/https, mailto and tel are
 * offered as "openable" at all).
 */
import { looksLikeEpc, parseEpc, type EpcParseError, type EpcPayment } from './epc';

export interface WifiConfig {
  ssid: string;
  password: string | null;
  security: 'WPA' | 'WEP' | 'nopass' | string;
  hidden: boolean;
}

export type BarcodeContent =
  | { kind: 'url'; url: string; host: string }
  | { kind: 'email'; address: string; url: string }
  | { kind: 'phone'; number: string; url: string }
  | { kind: 'wifi'; wifi: WifiConfig }
  | { kind: 'epc'; payment: EpcPayment }
  | { kind: 'epc_invalid'; error: EpcParseError }
  | { kind: 'text'; text: string };

export interface ScannedCode {
  /** Raw value exactly as scanned. */
  raw: string;
  /** Symbology as reported by the camera (qr, ean13, code128 …). */
  type: string;
  content: BarcodeContent;
}

/** Hard cap for what we keep in memory / history (very long codes are truncated for display only). */
export const MAX_RAW_LENGTH = 4096;

/** Unescapes `\;`, `\,`, `\:`, `\\` and `\"` in WIFI: fields. */
function unescapeWifi(v: string): string {
  return v.replace(/\\([\\;,:"])/g, '$1');
}

/** Parses `WIFI:T:WPA;S:MyNet;P:secret;H:false;;` (field order is free). */
export function parseWifi(raw: string): WifiConfig | null {
  if (!/^WIFI:/i.test(raw)) return null;
  const body = raw.slice(5);
  const fields: Record<string, string> = {};
  let key = '';
  let value = '';
  let readingKey = true;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && i + 1 < body.length) {
      if (readingKey) key += ch + body[i + 1];
      else value += ch + body[i + 1];
      i++;
      continue;
    }
    if (readingKey && ch === ':') {
      readingKey = false;
      continue;
    }
    if (!readingKey && ch === ';') {
      if (key) fields[key.toUpperCase()] = unescapeWifi(value);
      key = '';
      value = '';
      readingKey = true;
      continue;
    }
    if (readingKey) key += ch;
    else value += ch;
  }
  if (!readingKey && key) fields[key.toUpperCase()] = unescapeWifi(value);
  const ssid = fields.S;
  if (!ssid) return null;
  return {
    ssid,
    password: fields.P && fields.P.length > 0 ? fields.P : null,
    security: fields.T && fields.T.length > 0 ? fields.T : 'nopass',
    hidden: (fields.H ?? '').toLowerCase() === 'true',
  };
}

/** Host of an http(s) URL without relying on the URL global (Hermes compatible). */
export function urlHost(url: string): string | null {
  const m = /^https?:\/\/([^/?#\s]+)/i.exec(url);
  if (!m) return null;
  const authority = m[1];
  const at = authority.lastIndexOf('@');
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  const host = hostPort.replace(/:\d+$/, '').toLowerCase();
  return host.length > 0 ? host : null;
}

/** True when the URL embeds credentials ("https://bank.de@evil.example") – shown as a warning. */
export function urlHasUserInfo(url: string): boolean {
  const m = /^https?:\/\/([^/?#\s]+)/i.exec(url);
  return !!m && m[1].includes('@');
}

export function classifyBarcode(raw: string): BarcodeContent {
  const value = raw.trim();
  if (looksLikeEpc(raw)) {
    const res = parseEpc(raw);
    return res.ok ? { kind: 'epc', payment: res.payment } : { kind: 'epc_invalid', error: res.error };
  }
  if (/^https?:\/\/\S+$/i.test(value)) {
    const host = urlHost(value);
    if (host) return { kind: 'url', url: value, host };
  }
  const mail = /^mailto:([^?\s]+@[^?\s]+)/i.exec(value);
  if (mail) return { kind: 'email', address: decodeSafe(mail[1]), url: value };
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) {
    return { kind: 'email', address: value, url: `mailto:${value}` };
  }
  const tel = /^tel:([+\d][\d\s()./-]{2,})$/i.exec(value);
  if (tel) {
    const number = tel[1].replace(/[^\d+]/g, '');
    return { kind: 'phone', number, url: `tel:${number}` };
  }
  const wifi = parseWifi(value);
  if (wifi) return { kind: 'wifi', wifi };
  return { kind: 'text', text: value };
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Normalizes a symbology name reported by expo-camera ("org.iso.QRCode", "qr", 256 …). */
export function normalizeBarcodeType(type: unknown): string {
  const t = String(type ?? '').toLowerCase();
  if (t.includes('qr')) return 'qr';
  if (t.includes('ean13') || t.includes('ean-13')) return 'ean13';
  if (t.includes('ean8') || t.includes('ean-8')) return 'ean8';
  if (t.includes('upc_e') || t.includes('upce')) return 'upc_e';
  if (t.includes('upc')) return 'upc_a';
  if (t.includes('code128')) return 'code128';
  if (t.includes('code39')) return 'code39';
  if (t.includes('code93')) return 'code93';
  if (t.includes('datamatrix')) return 'datamatrix';
  if (t.includes('pdf417')) return 'pdf417';
  if (t.includes('aztec')) return 'aztec';
  if (t.includes('itf')) return 'itf14';
  if (t.includes('codabar')) return 'codabar';
  return t.length > 0 ? t : 'unknown';
}

export function toScannedCode(raw: string, type: unknown): ScannedCode {
  const clipped = raw.length > MAX_RAW_LENGTH ? raw.slice(0, MAX_RAW_LENGTH) : raw;
  return { raw: clipped, type: normalizeBarcodeType(type), content: classifyBarcode(clipped) };
}
