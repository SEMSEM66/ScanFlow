/**
 * Pure helper functions for M1 PDF Toolkit operations:
 * - Page split planning (1-based split index validation & partition)
 * - Page extraction ordering (preserving document page order)
 * - Batch ZIP filename deduplication
 * - PDF export password validation
 *
 * Pure TypeScript (zero React / Expo imports) for fast unit testing.
 */

export const MIN_PDF_PASSWORD_LENGTH = 4;

export interface PageSplitPlan {
  /** Pages that remain in the source document (pages 1 .. splitPageNumber - 1). */
  keepPageIds: string[];
  /** Pages that move into the new split document (pages splitPageNumber .. N). */
  movePageIds: string[];
}

/**
 * Computes which pages stay in the original document and which move to the new
 * document when splitting at 1-based `splitPageNumber` (must be >= 2 and <= total).
 * Returns `null` if the document has fewer than 2 pages or `splitPageNumber` is out of range.
 */
export function planPageSplit(orderedPageIds: readonly string[], splitPageNumber: number): PageSplitPlan | null {
  if (orderedPageIds.length < 2) return null;
  if (!Number.isInteger(splitPageNumber) || splitPageNumber < 2 || splitPageNumber > orderedPageIds.length) {
    return null;
  }
  const splitIndex = splitPageNumber - 1;
  return {
    keepPageIds: orderedPageIds.slice(0, splitIndex),
    movePageIds: orderedPageIds.slice(splitIndex),
  };
}

/**
 * Filters `orderedPageIds` to those present in `selectedPageIds`, preserving
 * the document's page order and ignoring unknown or duplicate IDs.
 */
export function planPageExtraction(
  orderedPageIds: readonly string[],
  selectedPageIds: Iterable<string>
): string[] {
  const selected = new Set(selectedPageIds);
  return orderedPageIds.filter((id) => selected.has(id));
}

/**
 * Generates unique file names for a batch ZIP archive (e.g. `["Scan.pdf", "Scan (2).pdf"]`)
 * so two documents with the same title never overwrite each other in the archive.
 */
export function deduplicateFileNames(
  titles: readonly string[],
  extension: string,
  sanitize: (title: string) => string
): string[] {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const used = new Map<string, number>();
  return titles.map((rawTitle) => {
    const base = sanitize(rawTitle);
    const key = base.toLowerCase();
    const count = used.get(key) ?? 0;
    used.set(key, count + 1);
    if (count === 0) {
      return `${base}${ext}`;
    }
    return `${base} (${count + 1})${ext}`;
  });
}

export type PasswordValidationResult =
  | { valid: true }
  | { valid: false; reason: 'too_short' | 'mismatch' };

/**
 * Validates a user-entered PDF password and its confirmation.
 */
export function validatePdfPassword(password: string, confirmPassword: string): PasswordValidationResult {
  if (password.length < MIN_PDF_PASSWORD_LENGTH) {
    return { valid: false, reason: 'too_short' };
  }
  if (password !== confirmPassword) {
    return { valid: false, reason: 'mismatch' };
  }
  return { valid: true };
}
