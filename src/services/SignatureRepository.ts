import { getDatabase } from '../db/database';
import {
  fitSignatureStrokes,
  normalizeHexColor,
  normalizeStrokeList,
  type SavedSignature,
  type StrokePoint,
} from '../imaging/annotations';

interface SignatureRow {
  id: string;
  name: string;
  strokes: string;
  color: string;
  aspect_ratio: number;
  image_png_base64: string | null;
  created_at: number;
}

function mapSignature(row: SignatureRow): SavedSignature {
  let strokes: StrokePoint[][] = [];
  try {
    strokes = normalizeStrokeList(JSON.parse(row.strokes));
  } catch {
    strokes = [];
  }
  return {
    id: row.id,
    name: row.name,
    strokes,
    color: normalizeHexColor(row.color, '#0B2E6B'),
    aspectRatio: typeof row.aspect_ratio === 'number' && row.aspect_ratio > 0 ? row.aspect_ratio : 2.4,
    imagePngBase64: row.image_png_base64,
    createdAt: row.created_at,
  };
}

export class SignatureRepository {
  async getAll(): Promise<SavedSignature[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SignatureRow>(
      'SELECT id, name, strokes, color, aspect_ratio, image_png_base64, created_at FROM signatures ORDER BY created_at DESC'
    );
    return rows.map(mapSignature);
  }

  async createFromStrokes(input: {
    name: string;
    strokes: StrokePoint[][];
    color?: string;
  }): Promise<SavedSignature> {
    const db = await getDatabase();
    const id = `sig_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    const now = Date.now();
    const fitted = fitSignatureStrokes(input.strokes);
    const color = normalizeHexColor(input.color, '#0B2E6B');
    const name = input.name.trim() || 'Unterschrift';

    await db.runAsync(
      'INSERT INTO signatures (id, name, strokes, color, aspect_ratio, image_png_base64, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
      [id, name, JSON.stringify(fitted.strokes), color, fitted.aspectRatio, now]
    );
    return {
      id,
      name,
      strokes: fitted.strokes,
      color,
      aspectRatio: fitted.aspectRatio,
      imagePngBase64: null,
      createdAt: now,
    };
  }

  async createFromPhoto(input: {
    name: string;
    imagePngBase64: string;
    aspectRatio: number;
    color?: string;
  }): Promise<SavedSignature> {
    const db = await getDatabase();
    const id = `sig_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    const now = Date.now();
    const color = normalizeHexColor(input.color, '#0B2E6B');
    const name = input.name.trim() || 'Unterschrift';

    await db.runAsync(
      'INSERT INTO signatures (id, name, strokes, color, aspect_ratio, image_png_base64, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, '[]', color, input.aspectRatio, input.imagePngBase64, now]
    );
    return {
      id,
      name,
      strokes: [],
      color,
      aspectRatio: input.aspectRatio,
      imagePngBase64: input.imagePngBase64,
      createdAt: now,
    };
  }

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM signatures WHERE id = ?', [id]);
  }
}

export const signatureRepository = new SignatureRepository();
