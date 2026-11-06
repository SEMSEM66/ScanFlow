import type { OcrLine } from '../ocr/types';
import { groupRows } from '../ocr/text';
import { buildZip, uint8ToBase64 } from './zip';

export type DocxBlockStyle = 'Heading1' | 'Heading2' | 'Normal';

export interface DocxBlock {
  style: DocxBlockStyle;
  text: string;
}

export interface DocxPageInput {
  pageNumber?: number;
  /** Structured OCR/PDF lines with normalized bounding boxes, if available. */
  lines?: OcrLine[];
  /** Plain text fallback when `lines` is omitted or empty. */
  text?: string;
}

export interface DocxBuildOptions {
  title: string;
  pages: DocxPageInput[];
  createdAt?: Date;
  creator?: string;
  /** Optional note inserted when a page has no recognized text. */
  emptyPageNote?: string;
}

interface RowMetrics {
  text: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
}

const LIST_ITEM_RE = /^(\u2022|\u2023|\u25E6|\u2013|\u2014|-|\*|\d+[.)]|[a-zA-Z][.)])\s+/;
const HYPHEN_END_RE = /[a-zA-Z\u00C0-\u024F]-$/;
const LOWER_START_RE = /^[a-z\u00DF-\u00FF]/;
const TERMINAL_PUNCT_RE = /[.!?:]$/;

/**
 * Escapes XML special characters and strips invalid XML 1.0 control characters
 * so Word / Pages / Google Docs never reject the generated XML.
 */
export function escapeXml(raw: string): string {
  // Strip ASCII control chars illegal in XML 1.0 (keep \t, \n, \r)
  const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '');
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function median(values: number[]): number {
  if (values.length === 0) return 0.02;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function joinWrappedLine(prev: string, next: string): string {
  if (!prev) return next;
  if (!next) return prev;
  if (HYPHEN_END_RE.test(prev) && LOWER_START_RE.test(next)) {
    return prev.slice(0, -1) + next;
  }
  return `${prev} ${next}`;
}

/**
 * Reconstructs headings and reading-order paragraphs from a single page's
 * structured OCR/PDF lines or fallback plain text.
 */
export function reconstructPageBlocks(page: DocxPageInput): DocxBlock[] {
  const validLines = (page.lines ?? []).filter((l) => l.text && l.text.trim().length > 0);

  if (validLines.length > 0) {
    const rawRows = groupRows(validLines);
    const rows: RowMetrics[] = [];

    for (const r of rawRows) {
      const text = r
        .map((l) => l.text.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;

      let top = Infinity;
      let bottom = -Infinity;
      let left = Infinity;
      let right = -Infinity;
      for (const l of r) {
        if (l.box.y < top) top = l.box.y;
        if (l.box.y + l.box.h > bottom) bottom = l.box.y + l.box.h;
        if (l.box.x < left) left = l.box.x;
        if (l.box.x + l.box.w > right) right = l.box.x + l.box.w;
      }
      rows.push({
        text,
        top,
        bottom,
        left,
        right,
        height: Math.max(0.002, bottom - top),
      });
    }

    if (rows.length === 0) return [];

    const medHeight = median(rows.map((r) => r.height));
    const maxRight = Math.max(...rows.map((r) => r.right));

    const classifyRow = (row: RowMetrics, index: number): DocxBlockStyle => {
      const len = row.text.length;
      const endsWithClausePunct = /[,;]$/.test(row.text);
      if (len <= 120 && !endsWithClausePunct) {
        if (row.height >= medHeight * 1.5) return 'Heading1';
        if (row.height >= medHeight * 1.25) return 'Heading2';
      }
      // Standalone short first line separated by a clear vertical gap
      if (
        index === 0 &&
        rows.length > 1 &&
        len <= 80 &&
        !TERMINAL_PUNCT_RE.test(row.text) &&
        !endsWithClausePunct &&
        rows[1].top - row.bottom > medHeight * 0.85
      ) {
        return 'Heading2';
      }
      return 'Normal';
    };

    const blocks: DocxBlock[] = [];
    let currentParagraph: string | null = null;
    let prevNormalRow: RowMetrics | null = null;

    const flushParagraph = () => {
      if (currentParagraph !== null && currentParagraph.trim().length > 0) {
        blocks.push({ style: 'Normal', text: currentParagraph.trim() });
      }
      currentParagraph = null;
      prevNormalRow = null;
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const style = classifyRow(row, i);

      if (style !== 'Normal') {
        flushParagraph();
        blocks.push({ style, text: row.text });
        continue;
      }

      if (currentParagraph === null || prevNormalRow === null) {
        currentParagraph = row.text;
        prevNormalRow = row;
        continue;
      }

      const verticalGap = row.top - prevNormalRow.bottom;
      const refHeight = Math.max(prevNormalRow.height, row.height, medHeight);
      const largeVerticalGap = verticalGap > refHeight * 0.65;
      const indentedNewPara = row.left > prevNormalRow.left + 0.045;
      const startsList = LIST_ITEM_RE.test(row.text);
      const prevEndedShort =
        maxRight - prevNormalRow.right > 0.18 && TERMINAL_PUNCT_RE.test(prevNormalRow.text);

      if (largeVerticalGap || indentedNewPara || startsList || prevEndedShort) {
        flushParagraph();
        currentParagraph = row.text;
        prevNormalRow = row;
      } else {
        currentParagraph = joinWrappedLine(currentParagraph, row.text);
        prevNormalRow = row;
      }
    }

    flushParagraph();
    return blocks;
  }

  // Fallback: plain text reconstruction
  const rawText = (page.text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!rawText) return [];

  const chunks = rawText
    .split(/\n\s*\n+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const blocks: DocxBlock[] = [];
  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const rawLines = chunks[cIdx]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (rawLines.length === 0) continue;

    if (
      cIdx === 0 &&
      chunks.length > 1 &&
      rawLines.length === 1 &&
      rawLines[0].length <= 80 &&
      !TERMINAL_PUNCT_RE.test(rawLines[0])
    ) {
      blocks.push({ style: 'Heading1', text: rawLines[0] });
      continue;
    }

    let acc = '';
    for (const line of rawLines) {
      if (LIST_ITEM_RE.test(line)) {
        if (acc) {
          blocks.push({ style: 'Normal', text: acc });
          acc = '';
        }
        blocks.push({ style: 'Normal', text: line });
      } else {
        acc = joinWrappedLine(acc, line);
      }
    }
    if (acc) {
      blocks.push({ style: 'Normal', text: acc });
    }
  }

  return blocks;
}

function buildContentTypesXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>'
  );
}

function buildRootRelsXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>'
  );
}

function buildDocumentRelsXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>'
  );
}

function buildCorePropsXml(title: string, creator: string, createdAt: Date): string {
  const iso = createdAt.toISOString();
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties ' +
    'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(title)}</dc:title>` +
    `<dc:creator>${escapeXml(creator)}</dc:creator>` +
    `<cp:lastModifiedBy>${escapeXml(creator)}</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

function buildAppPropsXml(pageCount: number): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>ScanFlow</Application>' +
    `<Pages>${Math.max(1, pageCount)}</Pages>` +
    '</Properties>'
  );
}

function buildStylesXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults>' +
    '<w:rPrDefault>' +
    '<w:rPr>' +
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="22"/>' +
    '<w:szCs w:val="22"/>' +
    '</w:rPr>' +
    '</w:rPrDefault>' +
    '<w:pPrDefault>' +
    '<w:pPr>' +
    '<w:spacing w:after="160" w:line="276" w:lineRule="auto"/>' +
    '</w:pPr>' +
    '</w:pPrDefault>' +
    '</w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
    '<w:name w:val="Normal"/>' +
    '<w:qFormat/>' +
    '</w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1">' +
    '<w:name w:val="heading 1"/>' +
    '<w:basedOn w:val="Normal"/>' +
    '<w:next w:val="Normal"/>' +
    '<w:qFormat/>' +
    '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr>' +
    '<w:rPr><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr>' +
    '</w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2">' +
    '<w:name w:val="heading 2"/>' +
    '<w:basedOn w:val="Normal"/>' +
    '<w:next w:val="Normal"/>' +
    '<w:qFormat/>' +
    '<w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/></w:pPr>' +
    '<w:rPr><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>' +
    '</w:style>' +
    '</w:styles>'
  );
}

function buildParagraphXml(block: DocxBlock, pageBreakBefore = false): string {
  const styleTag =
    block.style !== 'Normal' ? `<w:pStyle w:val="${block.style}"/>` : '';
  const pPr = styleTag ? `<w:pPr>${styleTag}</w:pPr>` : '';
  const brTag = pageBreakBefore ? '<w:r><w:br w:type="page"/></w:r>' : '';
  const escaped = escapeXml(block.text);
  const preserveSpace =
    block.text.startsWith(' ') || block.text.endsWith(' ')
      ? ' xml:space="preserve"'
      : '';
  return `<w:p>${pPr}${brTag}<w:r><w:t${preserveSpace}>${escaped}</w:t></w:r></w:p>`;
}

function buildDocumentXml(pages: DocxPageInput[], emptyPageNote?: string): string {
  const paragraphs: string[] = [];
  const effectivePages = pages.length > 0 ? pages : [{ text: '' }];

  for (let pIdx = 0; pIdx < effectivePages.length; pIdx++) {
    const blocks = reconstructPageBlocks(effectivePages[pIdx]);
    const isSubsequentPage = pIdx > 0;

    if (blocks.length === 0) {
      const note = emptyPageNote ?? '';
      if (note) {
        paragraphs.push(buildParagraphXml({ style: 'Normal', text: note }, isSubsequentPage));
      } else if (isSubsequentPage) {
        paragraphs.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      } else {
        paragraphs.push('<w:p/>');
      }
      continue;
    }

    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      paragraphs.push(buildParagraphXml(blocks[bIdx], isSubsequentPage && bIdx === 0));
    }
  }

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<w:body>' +
    paragraphs.join('') +
    '<w:sectPr>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
    '</w:sectPr>' +
    '</w:body>' +
    '</w:document>'
  );
}

/**
 * Generates a valid OpenXML Word (.docx) file as raw bytes.
 */
export function buildDocx(options: DocxBuildOptions): Uint8Array {
  const createdAt = options.createdAt ?? new Date();
  const creator = options.creator ?? 'ScanFlow';
  const title = options.title.trim() || 'Document';

  return buildZip(
    [
      { name: '[Content_Types].xml', data: buildContentTypesXml() },
      { name: '_rels/.rels', data: buildRootRelsXml() },
      { name: 'docProps/core.xml', data: buildCorePropsXml(title, creator, createdAt) },
      { name: 'docProps/app.xml', data: buildAppPropsXml(options.pages.length) },
      { name: 'word/_rels/document.xml.rels', data: buildDocumentRelsXml() },
      { name: 'word/styles.xml', data: buildStylesXml() },
      {
        name: 'word/document.xml',
        data: buildDocumentXml(options.pages, options.emptyPageNote),
      },
    ],
    createdAt
  );
}

/**
 * Generates a valid OpenXML Word (.docx) file encoded as Base64 for writing via
 * `expo-file-system`.
 */
export function buildDocxBase64(options: DocxBuildOptions): string {
  return uint8ToBase64(buildDocx(options));
}
