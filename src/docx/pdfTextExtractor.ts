import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  type PDFPage,
} from 'pdf-lib';
import type { OcrBox, OcrLine, OcrWord } from '../ocr/types';
import { pageText, readingOrder } from '../ocr/text';
import { cleanText } from '../ocr/vision';

export interface ExtractedPdfPage {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  lines: OcrLine[];
  text: string;
}

/**
 * WinAnsiEncoding mapping for bytes 0x80..0x9F (standard PDF Latin encoding).
 * Bytes 0x20..0x7E and 0xA0..0xFF match Unicode code points directly.
 */
const WIN_ANSI_80_9F: Record<number, number> = {
  0x80: 0x20ac, // €
  0x82: 0x201a, // ‚
  0x83: 0x0192, // ƒ
  0x84: 0x201e, // „
  0x85: 0x2026, // …
  0x86: 0x2020, // †
  0x87: 0x2021, // ‡
  0x88: 0x02c6, // ˆ
  0x89: 0x2030, // ‰
  0x8a: 0x0160, // Š
  0x8b: 0x2039, // ‹
  0x8c: 0x0152, // Œ
  0x8e: 0x017d, // Ž
  0x91: 0x2018, // ‘
  0x92: 0x2019, // ’
  0x93: 0x201c, // “
  0x94: 0x201d, // ”
  0x95: 0x2022, // •
  0x96: 0x2013, // –
  0x97: 0x2014, // —
  0x98: 0x02dc, // ˜
  0x99: 0x2122, // ™
  0x9a: 0x0161, // š
  0x9b: 0x203a, // ›
  0x9c: 0x0153, // œ
  0x9e: 0x017e, // ž
  0x9f: 0x0178, // Ÿ
};

function decodeWinAnsiByte(b: number): string {
  const byte = b & 0xff;
  const mapped = WIN_ANSI_80_9F[byte];
  if (mapped !== undefined) return String.fromCodePoint(mapped);
  return String.fromCodePoint(byte);
}

type FontCMap = Map<number, string>;

interface FontDecoder {
  cmap: FontCMap | null;
  twoByte: boolean;
}

function parseToUnicodeCMap(cmapText: string): FontDecoder {
  const cmap: FontCMap = new Map();
  let twoByte = false;

  const csRangeMatch = cmapText.match(/begincodespacerange[\s\S]*?<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
  if (csRangeMatch && csRangeMatch[1].length >= 4) {
    twoByte = true;
  }

  const decodeHexUtf16 = (hex: string): string => {
    if (hex.length <= 2) {
      return String.fromCodePoint(parseInt(hex, 16));
    }
    let out = '';
    for (let i = 0; i + 3 < hex.length; i += 4) {
      const unit = parseInt(hex.slice(i, i + 4), 16);
      if (Number.isFinite(unit)) out += String.fromCharCode(unit);
    }
    return out;
  };

  // Parse beginbfchar ... endbfchar
  const bfCharBlocks = cmapText.matchAll(/beginbfchar([\s\S]*?)endbfchar/g);
  for (const block of bfCharBlocks) {
    const pairs = block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
    for (const pair of pairs) {
      if (pair[1].length >= 4) twoByte = true;
      const code = parseInt(pair[1], 16);
      const str = decodeHexUtf16(pair[2]);
      if (Number.isFinite(code) && str) cmap.set(code, str);
    }
  }

  // Parse beginbfrange ... endbfrange
  const bfRangeBlocks = cmapText.matchAll(/beginbfrange([\s\S]*?)endbfrange/g);
  for (const block of bfRangeBlocks) {
    const ranges = block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
    for (const r of ranges) {
      if (r[1].length >= 4) twoByte = true;
      const start = parseInt(r[1], 16);
      const end = parseInt(r[2], 16);
      const dstStart = parseInt(r[3], 16);
      if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(dstStart)) continue;
      const count = Math.min(256, end - start + 1);
      for (let i = 0; i < count; i++) {
        cmap.set(start + i, String.fromCodePoint(dstStart + i));
      }
    }
  }

  return { cmap: cmap.size > 0 ? cmap : null, twoByte };
}

function extractPageFontDecoders(page: PDFPage): Map<string, FontDecoder> {
  const result = new Map<string, FontDecoder>();
  try {
    const resources = page.node.Resources();
    const fontDict = resources?.lookup(PDFName.of('Font'));
    if (!(fontDict instanceof PDFDict)) return result;

    for (const [keyObj, valRef] of fontDict.entries()) {
      const fontName = keyObj.asString(); // e.g. "/F1"
      const cleanName = fontName.startsWith('/') ? fontName.slice(1) : fontName;
      const fontObj = page.doc.context.lookup(valRef);
      if (!(fontObj instanceof PDFDict)) continue;

      const toUnicodeRef = fontObj.get(PDFName.of('ToUnicode'));
      const toUnicodeStream = toUnicodeRef ? page.doc.context.lookup(toUnicodeRef) : undefined;
      if (toUnicodeStream instanceof PDFRawStream) {
        try {
          const decoded = decodePDFRawStream(toUnicodeStream).decode();
          let text = '';
          for (let i = 0; i < decoded.length; i++) {
            text += String.fromCharCode(decoded[i]);
          }
          result.set(cleanName, parseToUnicodeCMap(text));
        } catch {
          // ignore malformed ToUnicode stream
        }
      }
    }
  } catch {
    // ignore font dictionary lookup errors
  }
  return result;
}

function decodePdfBytes(bytes: number[], decoder?: FontDecoder): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out;
  }

  if (decoder?.cmap) {
    const { cmap, twoByte } = decoder;
    if (twoByte && bytes.length % 2 === 0) {
      let out = '';
      for (let i = 0; i < bytes.length; i += 2) {
        const code = (bytes[i] << 8) | bytes[i + 1];
        out += cmap.get(code) ?? decodeWinAnsiByte(bytes[i + 1]);
      }
      return out;
    }
    let out = '';
    for (const b of bytes) {
      out += cmap.get(b) ?? decodeWinAnsiByte(b);
    }
    return out;
  }

  let out = '';
  for (const b of bytes) {
    out += decodeWinAnsiByte(b);
  }
  return out;
}

function parseLiteralBytes(raw: string): number[] {
  const bytes: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch !== '\\') {
      bytes.push(raw.charCodeAt(i) & 0xff);
      i++;
      continue;
    }
    i++;
    if (i >= raw.length) break;
    const esc = raw[i];
    if (esc >= '0' && esc <= '7') {
      let oct = esc;
      i++;
      if (i < raw.length && raw[i] >= '0' && raw[i] <= '7') {
        oct += raw[i++];
        if (i < raw.length && raw[i] >= '0' && raw[i] <= '7') {
          oct += raw[i++];
        }
      }
      bytes.push(parseInt(oct, 8) & 0xff);
    } else if (esc === 'n') {
      bytes.push(10);
      i++;
    } else if (esc === 'r') {
      bytes.push(13);
      i++;
    } else if (esc === 't') {
      bytes.push(9);
      i++;
    } else if (esc === 'b') {
      bytes.push(8);
      i++;
    } else if (esc === 'f') {
      bytes.push(12);
      i++;
    } else if (esc === '\r' || esc === '\n') {
      if (esc === '\r' && raw[i + 1] === '\n') i++;
      i++;
    } else {
      bytes.push(raw.charCodeAt(i) & 0xff);
      i++;
    }
  }
  return bytes;
}

function parseHexBytes(hexContent: string): number[] {
  const clean = hexContent.replace(/\s+/g, '');
  const padded = clean.length % 2 === 1 ? `${clean}0` : clean;
  const bytes: number[] = [];
  for (let i = 0; i < padded.length; i += 2) {
    const val = parseInt(padded.slice(i, i + 2), 16);
    if (Number.isFinite(val)) bytes.push(val);
  }
  return bytes;
}

interface PdfToken {
  type: 'num' | 'name' | 'lit' | 'hex' | 'array' | 'op';
  value: string;
  items?: PdfToken[];
}

function tokenizeTextBlock(block: string): PdfToken[] {
  const tokens: PdfToken[] = [];
  let i = 0;
  const len = block.length;

  const readLiteral = (): string => {
    i++; // skip '('
    let depth = 1;
    let out = '';
    while (i < len && depth > 0) {
      const ch = block[i];
      if (ch === '\\') {
        out += ch;
        i++;
        if (i < len) {
          out += block[i];
          i++;
        }
        continue;
      }
      if (ch === '(') {
        depth++;
        out += ch;
      } else if (ch === ')') {
        depth--;
        if (depth > 0) out += ch;
      } else {
        out += ch;
      }
      i++;
    }
    return out;
  };

  const readHex = (): string => {
    i++; // skip '<'
    let out = '';
    while (i < len && block[i] !== '>') {
      out += block[i++];
    }
    if (i < len && block[i] === '>') i++;
    return out;
  };

  while (i < len) {
    const ch = block[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '%') {
      while (i < len && block[i] !== '\n' && block[i] !== '\r') i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lit', value: readLiteral() });
      continue;
    }
    if (ch === '<' && block[i + 1] !== '<') {
      tokens.push({ type: 'hex', value: readHex() });
      continue;
    }
    if (ch === '<' && block[i + 1] === '<') {
      i += 2;
      continue;
    }
    if (ch === '>' && block[i + 1] === '>') {
      i += 2;
      continue;
    }
    if (ch === '[') {
      i++;
      const items: PdfToken[] = [];
      while (i < len && block[i] !== ']') {
        const c = block[i];
        if (/\s/.test(c)) {
          i++;
          continue;
        }
        if (c === '(') {
          items.push({ type: 'lit', value: readLiteral() });
        } else if (c === '<' && block[i + 1] !== '<') {
          items.push({ type: 'hex', value: readHex() });
        } else {
          let word = '';
          while (i < len && !/[\s()<>[\]/]/.test(block[i])) {
            word += block[i++];
          }
          if (!word) {
            i++;
            continue;
          }
          if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
            items.push({ type: 'num', value: word });
          } else {
            items.push({ type: 'op', value: word });
          }
        }
      }
      if (i < len && block[i] === ']') i++;
      tokens.push({ type: 'array', value: '', items });
      continue;
    }
    if (ch === '/') {
      i++;
      let name = '';
      while (i < len && !/[\s()<>[\]/%]/.test(block[i])) {
        name += block[i++];
      }
      tokens.push({ type: 'name', value: name });
      continue;
    }

    let word = '';
    while (i < len && !/[\s()<>[\]/%]/.test(block[i])) {
      word += block[i++];
    }
    if (!word) {
      i++;
      continue;
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
      tokens.push({ type: 'num', value: word });
    } else {
      tokens.push({ type: 'op', value: word });
    }
  }

  return tokens;
}

interface PositionedSpan {
  text: string;
  xPt: number;
  yTopPt: number;
  wPt: number;
  hPt: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function extractPageSpans(content: string, fontDecoders: Map<string, FontDecoder>, pageWidthPt: number, pageHeightPt: number): PositionedSpan[] {
  const spans: PositionedSpan[] = [];
  const btBlocks = content.matchAll(/\bBT\b([\s\S]*?)\bET\b/g);

  for (const match of btBlocks) {
    const tokens = tokenizeTextBlock(match[1]);
    const stack: PdfToken[] = [];

    let fontName = '';
    let fontSize = 12;
    let horizScale = 100;
    let leading = 0;

    // Text matrix [a, b, c, d, e, f] and line matrix [la, lb, lc, ld, le, lf]
    let tm = [1, 0, 0, 1, 0, 0];
    let tlm = [1, 0, 0, 1, 0, 0];

    const decodeToken = (tok: PdfToken): string => {
      const dec = fontDecoders.get(fontName);
      if (tok.type === 'lit') return decodePdfBytes(parseLiteralBytes(tok.value), dec);
      if (tok.type === 'hex') return decodePdfBytes(parseHexBytes(tok.value), dec);
      return '';
    };

    const emitText = (rawText: string) => {
      const scaleX = Math.hypot(tm[0], tm[1]) || 1;
      const scaleY = Math.hypot(tm[2], tm[3]) || 1;
      const effFontPt = Math.max(2, fontSize * scaleY);
      const charWidthPt = effFontPt * 0.52 * (horizScale / 100) * (scaleX / scaleY);
      const advancePt = Math.max(1, rawText.length * charWidthPt);

      const trimmed = cleanText(rawText);
      if (trimmed) {
        const xPt = tm[4];
        const baselinePt = tm[5];
        const hPt = effFontPt * 0.925;
        const descentPt = effFontPt * 0.207;
        const yBottomPt = baselinePt - descentPt;
        const yTopPt = pageHeightPt - (yBottomPt + hPt);
        const wPt = Math.max(1, trimmed.length * charWidthPt);

        spans.push({
          text: trimmed,
          xPt,
          yTopPt,
          wPt,
          hPt,
        });
      }

      tm[4] += advancePt;
    };

    for (const tok of tokens) {
      if (tok.type !== 'op') {
        stack.push(tok);
        continue;
      }

      const op = tok.value;
      if (op === 'Tf' && stack.length >= 2) {
        const sizeTok = stack.pop()!;
        const nameTok = stack.pop()!;
        const parsedSize = parseFloat(sizeTok.value);
        if (Number.isFinite(parsedSize) && parsedSize > 0) fontSize = parsedSize;
        if (nameTok.type === 'name') fontName = nameTok.value;
      } else if (op === 'Tz' && stack.length >= 1) {
        const scaleTok = stack.pop()!;
        const parsed = parseFloat(scaleTok.value);
        if (Number.isFinite(parsed) && parsed > 0) horizScale = parsed;
      } else if (op === 'TL' && stack.length >= 1) {
        const leadTok = stack.pop()!;
        const parsed = parseFloat(leadTok.value);
        if (Number.isFinite(parsed)) leading = parsed;
      } else if (op === 'Tm' && stack.length >= 6) {
        const vals = stack.splice(stack.length - 6, 6).map((t) => parseFloat(t.value));
        if (vals.every(Number.isFinite)) {
          tm = [...vals];
          tlm = [...vals];
        }
      } else if ((op === 'Td' || op === 'TD') && stack.length >= 2) {
        const ty = parseFloat(stack.pop()!.value);
        const tx = parseFloat(stack.pop()!.value);
        if (Number.isFinite(tx) && Number.isFinite(ty)) {
          if (op === 'TD') leading = -ty;
          const newE = tx * tlm[0] + ty * tlm[2] + tlm[4];
          const newF = tx * tlm[1] + ty * tlm[3] + tlm[5];
          tlm[4] = newE;
          tlm[5] = newF;
          tm = [...tlm];
        }
      } else if (op === 'T*') {
        const ty = -leading;
        const newE = ty * tlm[2] + tlm[4];
        const newF = ty * tlm[3] + tlm[5];
        tlm[4] = newE;
        tlm[5] = newF;
        tm = [...tlm];
      } else if (op === 'Tj' && stack.length >= 1) {
        const strTok = stack.pop()!;
        emitText(decodeToken(strTok));
      } else if (op === "'" && stack.length >= 1) {
        const strTok = stack.pop()!;
        const ty = -leading;
        tlm[4] += ty * tlm[2];
        tlm[5] += ty * tlm[3];
        tm = [...tlm];
        emitText(decodeToken(strTok));
      } else if (op === '"' && stack.length >= 3) {
        const strTok = stack.pop()!;
        stack.pop(); // ac
        stack.pop(); // aw
        const ty = -leading;
        tlm[4] += ty * tlm[2];
        tlm[5] += ty * tlm[3];
        tm = [...tlm];
        emitText(decodeToken(strTok));
      } else if (op === 'TJ' && stack.length >= 1) {
        const arrTok = stack.pop()!;
        if (arrTok.type === 'array' && arrTok.items) {
          let buf = '';
          for (const item of arrTok.items) {
            if (item.type === 'lit' || item.type === 'hex') {
              buf += decodeToken(item);
            } else if (item.type === 'num') {
              const adj = parseFloat(item.value);
              if (Number.isFinite(adj) && adj < -180) {
                if (buf && !buf.endsWith(' ')) buf += ' ';
              }
            }
          }
          if (buf) emitText(buf);
        }
      }
      stack.length = 0;
    }
  }

  return spans.filter(
    (s) =>
      s.text.length > 0 &&
      Number.isFinite(s.xPt) &&
      Number.isFinite(s.yTopPt) &&
      s.xPt < pageWidthPt * 1.1 &&
      s.yTopPt < pageHeightPt * 1.1
  );
}

function spansToOcrLines(spans: PositionedSpan[], pageWidthPt: number, pageHeightPt: number): OcrLine[] {
  if (spans.length === 0 || pageWidthPt <= 0 || pageHeightPt <= 0) return [];

  const words: OcrWord[] = [];
  for (const s of spans) {
    const x = clamp01(s.xPt / pageWidthPt);
    const y = clamp01(s.yTopPt / pageHeightPt);
    const w = clamp01(Math.min(1 - x, Math.max(0.005, s.wPt / pageWidthPt)));
    const h = clamp01(Math.min(1 - y, Math.max(0.005, s.hPt / pageHeightPt)));
    if (w <= 0 || h <= 0) continue;

    const parts = s.text.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      words.push({ text: s.text, box: { x: r4(x), y: r4(y), w: r4(w), h: r4(h) } });
    } else {
      const totalChars = parts.reduce((acc, p) => acc + p.length, 0) + (parts.length - 1);
      let offset = 0;
      for (const p of parts) {
        const pw = Math.max(0.004, (p.length / totalChars) * w);
        const px = Math.min(1 - pw, x + (offset / totalChars) * w);
        words.push({ text: p, box: { x: r4(px), y: r4(y), w: r4(pw), h: r4(h) } });
        offset += p.length + 1;
      }
    }
  }

  if (words.length === 0) return [];

  // Group words that lie on the same visual baseline and are horizontally adjacent into lines
  const sortedWords = [...words].sort((a, b) => {
    const cyA = a.box.y + a.box.h / 2;
    const cyB = b.box.y + b.box.h / 2;
    const tol = Math.min(a.box.h, b.box.h) * 0.55;
    if (Math.abs(cyA - cyB) <= tol) return a.box.x - b.box.x;
    return cyA - cyB;
  });

  const groupedWords: OcrWord[][] = [];
  for (const w of sortedWords) {
    const cy = w.box.y + w.box.h / 2;
    let placed = false;
    for (let i = groupedWords.length - 1; i >= 0; i--) {
      const group = groupedWords[i];
      const last = group[group.length - 1];
      const lastCy = last.box.y + last.box.h / 2;
      const tolY = Math.max(last.box.h, w.box.h) * 0.6;
      const gapX = w.box.x - (last.box.x + last.box.w);
      if (Math.abs(cy - lastCy) <= tolY && gapX >= -last.box.h * 0.8 && gapX <= Math.max(0.12, last.box.h * 4.5)) {
        group.push(w);
        placed = true;
        break;
      }
    }
    if (!placed) {
      groupedWords.push([w]);
    }
  }

  const lines: OcrLine[] = groupedWords.map((group) => {
    group.sort((a, b) => a.box.x - b.box.x);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const w of group) {
      if (w.box.x < minX) minX = w.box.x;
      if (w.box.y < minY) minY = w.box.y;
      if (w.box.x + w.box.w > maxX) maxX = w.box.x + w.box.w;
      if (w.box.y + w.box.h > maxY) maxY = w.box.y + w.box.h;
    }
    const box: OcrBox = {
      x: r4(clamp01(minX)),
      y: r4(clamp01(minY)),
      w: r4(clamp01(maxX - minX)),
      h: r4(clamp01(maxY - minY)),
    };
    return {
      text: group.map((w) => w.text).join(' '),
      confidence: 1,
      box,
      words: group,
    };
  });

  return readingOrder(lines);
}

function readPageContentString(page: PDFPage): string {
  const contents = page.node.Contents();
  if (!contents) return '';
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => page.doc.context.lookup(ref))
      : [page.doc.context.lookup(contents) ?? contents];

  const parts: string[] = [];
  for (const s of streams) {
    if (s instanceof PDFRawStream) {
      try {
        const bytes = decodePDFRawStream(s).decode();
        let str = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          const sub = bytes.subarray(i, Math.min(bytes.length, i + chunk));
          str += String.fromCharCode(...sub);
        }
        parts.push(str);
      } catch {
        // skip undecodable stream
      }
    }
  }
  return parts.join('\n');
}

/**
 * Pure-TypeScript extractor that reads embedded text and bounding boxes from
 * PDF bytes (works in Expo Go, IPA, and Node tests).
 */
export async function extractPdfTextFromBytes(pdfBytes: Uint8Array): Promise<ExtractedPdfPage[]> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();
  const result: ExtractedPdfPage[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const content = readPageContentString(page);
    const fontDecoders = extractPageFontDecoders(page);
    const spans = extractPageSpans(content, fontDecoders, width, height);
    const lines = spansToOcrLines(spans, width, height);
    const text = pageText(lines);

    result.push({
      pageNumber: i + 1,
      widthPt: width,
      heightPt: height,
      lines,
      text,
    });
  }

  return result;
}
