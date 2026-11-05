/**
 * ScanFlow PIN records (pure – no Expo imports, unit-tested).
 *
 * Stored format (iOS Keychain via expo-secure-store):
 *   v2$<digits>$<iterations>$<saltHex>$<hashHex>
 * hash = PBKDF2-HMAC-SHA256(pin, salt, iterations, 32 bytes), salt = 16 random bytes.
 *
 * Up to v1.3.0 the PIN was stored as a 32-bit string hash with a fixed salt
 * ("v1", 4 digits). Such records still verify and are upgraded to v2 after
 * the first successful entry.
 *
 * With only 10^4 / 10^6 possible PINs no hash can stop an attacker who has
 * the record – the real protection is the Keychain (this device only) and
 * the persisted attempt limit (see lockout.ts). The hash keeps the PIN itself
 * out of storage.
 */
import { constantTimeEqual, fromHex, pbkdf2Sha256, toHex, utf8 } from './sha256';

export type PinLength = 4 | 6;
export const PIN_LENGTHS: readonly PinLength[] = [4, 6];
export const DEFAULT_PIN_LENGTH: PinLength = 6;

/**
 * Estimated 0.2–0.4 s per check on an iPhone with Hermes (≈ 70 µs per
 * iteration measured with a JIT-less desktop JS engine; not yet measured on a device).
 */
export const PIN_ITERATIONS = 5000;
export const PIN_SALT_BYTES = 16;
const MIN_ITERATIONS = 1000;
const MAX_ITERATIONS = 1_000_000;

const LEGACY_SALT = 'scanflow_salt_v1_';

export type ParsedPinRecord =
  | { version: 2; length: PinLength; iterations: number; salt: Uint8Array; hash: Uint8Array }
  | { version: 1; length: 4; hash: string };

export function isPinLength(n: number): n is PinLength {
  return n === 4 || n === 6;
}

/** Digits only, 4 or 6 characters (or exactly `length`). */
export function isValidPin(pin: string, length?: PinLength): boolean {
  if (!/^[0-9]+$/.test(pin)) return false;
  return length ? pin.length === length : isPinLength(pin.length);
}

/** All digits equal (1111) or a straight run (1234, 9876, 012345 …). */
export function isWeakPin(pin: string): boolean {
  if (!/^[0-9]+$/.test(pin) || pin.length < 2) return true;
  const d = pin.split('').map(Number);
  const allSame = d.every((x) => x === d[0]);
  const ascending = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const descending = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  return allSame || ascending || descending;
}

/** The pre-1.4 hash (Java-style 32-bit string hash with a fixed salt). */
export function legacyPinHash(pin: string): string {
  const str = LEGACY_SALT + pin;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

export function hashPin(pin: string, salt: Uint8Array, iterations: number = PIN_ITERATIONS): Uint8Array {
  return pbkdf2Sha256(utf8(pin), salt, iterations, 32);
}

export function createPinRecord(pin: string, salt: Uint8Array, iterations: number = PIN_ITERATIONS): string {
  if (!isValidPin(pin)) throw new Error('PIN must be 4 or 6 digits');
  if (salt.length < 8) throw new Error('PIN salt too short');
  return ['v2', String(pin.length), String(iterations), toHex(salt), toHex(hashPin(pin, salt, iterations))].join('$');
}

export function parsePinRecord(stored: string | null | undefined): ParsedPinRecord | null {
  if (!stored) return null;
  if (stored.startsWith('v2$')) {
    const parts = stored.split('$');
    if (parts.length !== 5) return null;
    const length = Number(parts[1]);
    const iterations = Number(parts[2]);
    const salt = fromHex(parts[3]);
    const hash = fromHex(parts[4]);
    if (!isPinLength(length)) return null;
    if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return null;
    if (!salt || salt.length < 8 || !hash || hash.length !== 32) return null;
    return { version: 2, length, iterations, salt, hash };
  }
  // v1: hex string of a signed 32-bit integer, e.g. "5f3a9c1" or "-1b2c3d4e"
  if (/^-?[0-9a-f]{1,8}$/.test(stored)) return { version: 1, length: 4, hash: stored };
  return null;
}

export interface PinCheck {
  ok: boolean;
  /** true when the record should be rewritten in the current format. */
  needsUpgrade: boolean;
}

export function checkPin(pin: string, stored: string | null | undefined): PinCheck {
  const record = parsePinRecord(stored);
  if (!record || !isValidPin(pin, record.length)) return { ok: false, needsUpgrade: false };
  if (record.version === 1) {
    const ok = legacyPinHash(pin) === record.hash;
    return { ok, needsUpgrade: ok };
  }
  const ok = constantTimeEqual(hashPin(pin, record.salt, record.iterations), record.hash);
  return { ok, needsUpgrade: ok && record.iterations < PIN_ITERATIONS };
}
