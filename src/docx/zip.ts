/**
 * Minimal, pure-TypeScript ZIP archive writer (Store / method 0, UTF-8 file
 * names) for building OpenXML (.docx) packages without native dependencies.
 * Runs identically in React Native (Hermes / Expo Go / IPA) and in Node tests.
 */

export interface ZipEntryInput {
  /** Path inside the archive using forward slashes (e.g. "word/document.xml"). */
  name: string;
  /** UTF-8 string or raw bytes. */
  data: string | Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/** Standard IEEE 802.3 CRC-32 checksum. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Encodes a JavaScript string as UTF-8 bytes without relying on Node Buffer. */
export function utf8Encode(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.codePointAt(i) as number;
    if (cp > 0xffff) i++;
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    }
  }
  return new Uint8Array(out);
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encodes bytes as standard base64 string (for expo-file-system writeAsStringAsync). */
export function uint8ToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  let i = 0;
  while (i + 2 < len) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      B64_CHARS[(n >> 18) & 63] +
      B64_CHARS[(n >> 12) & 63] +
      B64_CHARS[(n >> 6) & 63] +
      B64_CHARS[n & 63];
    i += 3;
  }
  const rem = len - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + '=';
  }
  return out;
}

/** Decodes a standard base64 string into bytes. */
export function base64ToUint8(b64: string): Uint8Array {
  const clean = b64.replace(/[\r\n\s]/g, '');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = ((clean.length * 3) >> 2) - pad;
  const out = new Uint8Array(Math.max(0, outLen));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = B64_CHARS.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === '=' ? 0 : B64_CHARS.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === '=' ? 0 : B64_CHARS.indexOf(clean[i + 3]);
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (p < outLen) out[p++] = (n >> 16) & 0xff;
    if (p < outLen) out[p++] = (n >> 8) & 0xff;
    if (p < outLen) out[p++] = n & 0xff;
  }
  return out;
}

function writeU16(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
}

function writeU32(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
  buf[offset + 2] = (val >>> 16) & 0xff;
  buf[offset + 3] = (val >>> 24) & 0xff;
}

/** Builds a valid ZIP archive containing `entries` in order. */
export function buildZip(entries: ZipEntryInput[], date = new Date()): Uint8Array {
  const dosYear = Math.max(1980, date.getUTCFullYear());
  const dosDate = ((dosYear - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  const dosTime = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1);

  const prepared = entries.map((e) => {
    const nameBytes = utf8Encode(e.name.replace(/\\/g, '/'));
    const dataBytes = typeof e.data === 'string' ? utf8Encode(e.data) : e.data;
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc, offset: 0 };
  });

  let localSize = 0;
  let centralSize = 0;
  for (const item of prepared) {
    item.offset = localSize;
    localSize += 30 + item.nameBytes.length + item.dataBytes.length;
    centralSize += 46 + item.nameBytes.length;
  }

  const totalSize = localSize + centralSize + 22;
  const out = new Uint8Array(totalSize);
  let pos = 0;

  // Local file headers + data
  for (const item of prepared) {
    writeU32(out, pos, 0x04034b50); // Local file header signature
    writeU16(out, pos + 4, 20); // Version needed to extract (2.0)
    writeU16(out, pos + 6, 0x0800); // General purpose bit flag (bit 11 = UTF-8)
    writeU16(out, pos + 8, 0); // Compression method: 0 (Store)
    writeU16(out, pos + 10, dosTime);
    writeU16(out, pos + 12, dosDate);
    writeU32(out, pos + 14, item.crc);
    writeU32(out, pos + 18, item.dataBytes.length);
    writeU32(out, pos + 22, item.dataBytes.length);
    writeU16(out, pos + 26, item.nameBytes.length);
    writeU16(out, pos + 28, 0); // Extra field length
    pos += 30;
    out.set(item.nameBytes, pos);
    pos += item.nameBytes.length;
    out.set(item.dataBytes, pos);
    pos += item.dataBytes.length;
  }

  const centralOffset = pos;

  // Central directory headers
  for (const item of prepared) {
    writeU32(out, pos, 0x02014b50); // Central directory file header signature
    writeU16(out, pos + 4, 20); // Version made by
    writeU16(out, pos + 6, 20); // Version needed to extract
    writeU16(out, pos + 8, 0x0800); // UTF-8 flag
    writeU16(out, pos + 10, 0); // Compression method: Store
    writeU16(out, pos + 12, dosTime);
    writeU16(out, pos + 14, dosDate);
    writeU32(out, pos + 16, item.crc);
    writeU32(out, pos + 20, item.dataBytes.length);
    writeU32(out, pos + 24, item.dataBytes.length);
    writeU16(out, pos + 28, item.nameBytes.length);
    writeU16(out, pos + 30, 0); // Extra field length
    writeU16(out, pos + 32, 0); // File comment length
    writeU16(out, pos + 34, 0); // Disk number start
    writeU16(out, pos + 36, 0); // Internal file attributes
    writeU32(out, pos + 38, 0); // External file attributes
    writeU32(out, pos + 42, item.offset); // Relative offset of local header
    pos += 46;
    out.set(item.nameBytes, pos);
    pos += item.nameBytes.length;
  }

  // End of central directory record
  writeU32(out, pos, 0x06054b50);
  writeU16(out, pos + 4, 0); // Number of this disk
  writeU16(out, pos + 6, 0); // Disk where central directory starts
  writeU16(out, pos + 8, prepared.length);
  writeU16(out, pos + 10, prepared.length);
  writeU32(out, pos + 12, centralSize);
  writeU32(out, pos + 16, centralOffset);
  writeU16(out, pos + 20, 0); // Comment length

  return out;
}
