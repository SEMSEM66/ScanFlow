import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { ExportQuality, ExportFormat } from '../types';

export class ExportService {
  /**
   * Generates a multi-page A4 PDF from an array of image URIs with optional confidential watermark
   */
  async generatePdf(
    title: string,
    pageUris: string[],
    quality: ExportQuality,
    watermark?: string
  ): Promise<string> {
    // Read each page as base64 for reliable standalone offline rendering
    const base64Pages: string[] = [];

    for (const uri of pageUris) {
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mime = uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
      base64Pages.push(`data:${mime};base64,${b64}`);
    }

    const watermarkHtml = watermark
      ? `<div class="watermark">${watermark}</div>`
      : '';

    const pagesHtml = base64Pages
      .map(
        (b64) => `
        <div class="page">
          <img src="${b64}" />
          ${watermarkHtml}
        </div>
      `
      )
      .join('\n');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            background-color: #FFFFFF;
          }
          .page {
            width: 210mm;
            height: 297mm;
            page-break-after: always;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            position: relative;
          }
          .page:last-child {
            page-break-after: avoid;
          }
          img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
          .watermark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 48px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-weight: 800;
            color: rgba(220, 20, 60, 0.18);
            border: 5px solid rgba(220, 20, 60, 0.22);
            padding: 12px 28px;
            border-radius: 8px;
            text-transform: uppercase;
            letter-spacing: 5px;
            pointer-events: none;
            white-space: nowrap;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
      </html>
    `;

    const { uri } = await Print.printToFileAsync({
      html,
    });

    return uri;
  }

  /**
   * Triggers native iOS share sheet
   */
  async shareDocument(uri: string, format: ExportFormat): Promise<void> {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Teilen wird auf diesem Gerät nicht unterstützt.');
    }

    await Sharing.shareAsync(uri, {
      mimeType: format === 'pdf' ? 'application/pdf' : 'image/jpeg',
      UTI: format === 'pdf' ? 'com.adobe.pdf' : 'public.jpeg',
      dialogTitle: 'Dokument teilen',
    });
  }

  /**
   * Calculates human-readable estimated file size based on page count and quality
   */
  estimateSize(pageCount: number, format: ExportFormat, quality: ExportQuality): string {
    let sizePerMb: number;
    if (format === 'pdf') {
      if (quality === 'low') sizePerMb = 0.35;
      else if (quality === 'medium') sizePerMb = 0.9;
      else sizePerMb = 1.8;
    } else {
      if (quality === 'low') sizePerMb = 0.25;
      else if (quality === 'medium') sizePerMb = 0.6;
      else sizePerMb = 1.2;
    }

    const total = pageCount * sizePerMb;
    if (total < 1) {
      return `${Math.round(total * 1024)} KB`;
    }
    return `${total.toFixed(1).replace('.', ',')} MB`;
  }
}

export const exportService = new ExportService();
