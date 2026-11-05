/// <reference types="node" />
/**
 * Security building blocks (pure TypeScript, no Expo): SHA-256 / HMAC /
 * PBKDF2 against Node's crypto, PIN records incl. the pre-1.4 format, the
 * persisted attempt limit and the app-lock state machine (regression test
 * for the v1.3.0 Face ID loop).
 */
import { describe, expect, it } from '@jest/globals';
import crypto from 'crypto';
import { constantTimeEqual, fromHex, hmacSha256, pbkdf2Sha256, sha256, toHex, utf8 } from '../src/security/sha256';
import {
  checkPin,
  createPinRecord,
  hashPin,
  isValidPin,
  isWeakPin,
  legacyPinHash,
  parsePinRecord,
  PIN_ITERATIONS,
} from '../src/security/pinHash';
import {
  attemptsBeforeLockout,
  EMPTY_LOCKOUT,
  FREE_ATTEMPTS,
  formatWait,
  lockoutDurationMs,
  normalizeLockout,
  parseLockout,
  registerFailure,
  remainingLockoutMs,
  serializeLockout,
  type LockoutState,
} from '../src/security/lockout';
import {
  consumeAutoPrompt,
  initialLockState,
  onAppStateChange,
  onConfigChange,
  onUnlocked,
  UNLOCKED,
  type LockConfig,
  type LockState,
} from '../src/security/lockPolicy';

/** Deterministic pseudo-random bytes (xorshift) – reproducible test data. */
function bytes(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 255;
  }
  return out;
}
const nodeHex = (b: Buffer) => b.toString('hex');

describe('sha256 / hmacSha256 / pbkdf2Sha256', () => {
  it('matches known SHA-256 vectors', () => {
    expect(toHex(sha256(utf8('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(toHex(sha256(utf8('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches Node crypto for every length around the block boundaries', () => {
    for (let n = 0; n <= 300; n++) {
      const data = bytes(n, n + 1);
      expect(toHex(sha256(data))).toBe(nodeHex(crypto.createHash('sha256').update(data).digest()));
    }
  });

  it('matches the HMAC test vector (RFC 4231, case 1) and Node crypto for short and long keys', () => {
    const key = new Uint8Array(20).fill(0x0b);
    expect(toHex(hmacSha256(key, utf8('Hi There')))).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
    for (const keyLen of [0, 1, 32, 63, 64, 65, 131]) {
      for (const dataLen of [0, 17, 64, 200]) {
        const k = bytes(keyLen, keyLen * 7 + 3);
        const d = bytes(dataLen, dataLen * 11 + 5);
        expect(toHex(hmacSha256(k, d))).toBe(nodeHex(crypto.createHmac('sha256', k).update(d).digest()));
      }
    }
  });

  it('matches Node crypto PBKDF2 (iterations, multi-block and partial output)', () => {
    const cases: [string, number, number, number][] = [
      ['passwd', 8, 1, 64],
      ['1234', 16, 2, 32],
      ['258014', 16, 1000, 32],
      ['Grüße 👋', 12, 3, 20],
      ['', 16, 5, 33],
    ];
    for (const [password, saltLen, iterations, keyLen] of cases) {
      const salt = bytes(saltLen, iterations + keyLen);
      const ours = pbkdf2Sha256(utf8(password), salt, iterations, keyLen);
      const node = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, keyLen, 'sha256');
      expect(toHex(ours)).toBe(nodeHex(node));
    }
  });

  it('encodes UTF-8 like Node (umlauts, € and emoji surrogate pairs)', () => {
    for (const text of ['', '0123456789', 'Grüße', '€ 12,50', '👋🏽 Scan', '日本語']) {
      expect(toHex(utf8(text))).toBe(Buffer.from(text, 'utf8').toString('hex'));
    }
  });

  it('parses hex strictly and compares byte arrays', () => {
    const b = bytes(32, 99);
    expect(fromHex(toHex(b))).toEqual(b);
    expect(fromHex('ABcd')).toEqual(Uint8Array.from([0xab, 0xcd]));
    expect(fromHex('abc')).toBeNull();
    expect(fromHex('zz')).toBeNull();
    expect(fromHex('0x12')).toBeNull();
    expect(constantTimeEqual(b, Uint8Array.from(b))).toBe(true);
    const c = Uint8Array.from(b);
    c[31] ^= 1;
    expect(constantTimeEqual(b, c)).toBe(false);
    expect(constantTimeEqual(b, b.subarray(0, 31))).toBe(false);
    expect(constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});

describe('PIN records', () => {
  const salt = bytes(16, 42);

  it('accepts only 4 or 6 digits', () => {
    expect(isValidPin('1357')).toBe(true);
    expect(isValidPin('135790')).toBe(true);
    expect(isValidPin('13579')).toBe(false);
    expect(isValidPin('1357900')).toBe(false);
    expect(isValidPin('13a7')).toBe(false);
    expect(isValidPin('')).toBe(false);
    expect(isValidPin(' 1357')).toBe(false);
    expect(isValidPin('1357', 6)).toBe(false);
    expect(isValidPin('135790', 6)).toBe(true);
  });

  it('rejects the most obvious PINs', () => {
    for (const weak of ['0000', '1111', '1234', '4321', '0123', '6789', '123456', '654321', '000000', '999999', '345678']) {
      expect(isWeakPin(weak)).toBe(true);
    }
    for (const ok of ['1357', '2580', '1212', '0815', '135790', '258014', '199001']) {
      expect(isWeakPin(ok)).toBe(false);
    }
  });

  it('stores v2 records (PBKDF2-HMAC-SHA256, salted) and verifies them', () => {
    for (const pin of ['2580', '258014']) {
      const record = createPinRecord(pin, salt);
      expect(record).toMatch(new RegExp(`^v2\\$${pin.length}\\$${PIN_ITERATIONS}\\$[0-9a-f]{32}\\$[0-9a-f]{64}$`));
      expect(record).not.toContain(pin);
      const expected = crypto.pbkdf2Sync(pin, salt, PIN_ITERATIONS, 32, 'sha256').toString('hex');
      expect(record.split('$')[4]).toBe(expected);
      expect(parsePinRecord(record)).toMatchObject({ version: 2, length: pin.length, iterations: PIN_ITERATIONS });
      expect(checkPin(pin, record)).toEqual({ ok: true, needsUpgrade: false });
    }
    const record = createPinRecord('258014', salt);
    expect(checkPin('258015', record).ok).toBe(false);
    expect(checkPin('2580', record).ok).toBe(false); // wrong length is never checked
    expect(checkPin('', record).ok).toBe(false);
    expect(checkPin('258014', null).ok).toBe(false);
  });

  it('uses the salt: the same PIN gives different records', () => {
    const a = createPinRecord('258014', bytes(16, 1));
    const b = createPinRecord('258014', bytes(16, 2));
    expect(a).not.toBe(b);
    expect(checkPin('258014', a).ok && checkPin('258014', b).ok).toBe(true);
  });

  it('refuses invalid PINs and short salts', () => {
    expect(() => createPinRecord('12345', salt)).toThrow();
    expect(() => createPinRecord('12ab', salt)).toThrow();
    expect(() => createPinRecord('2580', bytes(7, 3))).toThrow();
  });

  it('asks for an upgrade of records with fewer iterations', () => {
    const old = createPinRecord('2580', salt, 1000);
    expect(checkPin('2580', old)).toEqual({ ok: true, needsUpgrade: true });
    expect(checkPin('2581', old)).toEqual({ ok: false, needsUpgrade: false });
    expect(hashPin('2580', salt, 1000)).toEqual(fromHex(old.split('$')[4]));
  });

  it('still verifies PINs stored by ScanFlow ≤ 1.3.0 (v1) and marks them for the upgrade', () => {
    // verbatim copy of the old AuthService.simpleHash + fixed salt
    const oldHash = (pin: string) => {
      const str = 'scanflow_salt_v1_' + pin;
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
      }
      return hash.toString(16);
    };
    const pins = ['0000', '1234', '2580', '9999', '4711', '0815'];
    expect(pins.some((p) => oldHash(p).startsWith('-'))).toBe(true); // negative hashes occur
    for (const pin of pins) {
      const stored = oldHash(pin);
      expect(legacyPinHash(pin)).toBe(stored);
      expect(parsePinRecord(stored)).toEqual({ version: 1, length: 4, hash: stored });
      expect(checkPin(pin, stored)).toEqual({ ok: true, needsUpgrade: true });
      expect(checkPin(pin === '1234' ? '1235' : '1234', stored).ok).toBe(false);
      expect(checkPin(`${pin}00`, stored).ok).toBe(false);
    }
  });

  it('rejects damaged or unknown records', () => {
    const good = createPinRecord('258014', salt).split('$');
    const variant = (i: number, v: string) => good.map((p, j) => (j === i ? v : p)).join('$');
    for (const bad of [
      null,
      undefined,
      '',
      'hello',
      '12345678g',
      '123456789', // 9 hex digits cannot come from a 32-bit hash
      'v3$6$5000$00$00',
      `${good.join('$')}$extra`,
      variant(1, '5'),
      variant(2, '999'),
      variant(2, '2000000'),
      variant(2, '5000.5'),
      variant(2, 'abc'),
      variant(3, '00112233445566'), // 7-byte salt
      variant(3, 'xyz'),
      variant(4, good[4].slice(0, 62)), // 31-byte hash
      variant(4, ''),
    ]) {
      expect(parsePinRecord(bad)).toBeNull();
      expect(checkPin('258014', bad).ok).toBe(false);
    }
  });
});

describe('PIN attempt limit', () => {
  const fail = (n: number, start = 1_000_000, step = 1000): LockoutState => {
    let s = EMPTY_LOCKOUT;
    for (let i = 0; i < n; i++) s = registerFailure(s, start + i * step);
    return s;
  };

  it('waits 30 s after the 5th wrong PIN, then 1 min, 5 min and 15 min', () => {
    expect([1, 2, 3, 4].map(lockoutDurationMs)).toEqual([0, 0, 0, 0]);
    expect([5, 6, 7, 8, 9, 30].map(lockoutDurationMs)).toEqual([30_000, 60_000, 300_000, 900_000, 900_000, 900_000]);
    expect(FREE_ATTEMPTS).toBe(5);
  });

  it('counts the attempts that are left and the remaining wait', () => {
    let s = EMPTY_LOCKOUT;
    const left: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = registerFailure(s, 1000 + i);
      left.push(attemptsBeforeLockout(s));
      expect(remainingLockoutMs(s, 1000 + i)).toBe(0);
    }
    expect(left).toEqual([4, 3, 2, 1]);
    s = registerFailure(s, 10_000);
    expect(attemptsBeforeLockout(s)).toBe(0);
    expect(remainingLockoutMs(s, 10_000)).toBe(30_000);
    expect(remainingLockoutMs(s, 39_000)).toBe(1000);
    expect(remainingLockoutMs(s, 40_000)).toBe(0);
    s = registerFailure(s, 40_000);
    expect(remainingLockoutMs(s, 40_000)).toBe(60_000);
  });

  it('restarts the full wait when the clock was set back', () => {
    const s = fail(5); // last failure at 1_004_000, locked until 1_034_000
    expect(normalizeLockout(s, 1_010_000)).toBe(s); // unchanged → same object (no Keychain write)
    const back = normalizeLockout(s, 500_000);
    expect(back).toEqual({ failures: 5, lockedUntil: 530_000, lastFailureAt: 500_000 });
    expect(remainingLockoutMs(s, 500_000)).toBe(30_000);
    expect(remainingLockoutMs(s, 0)).toBe(30_000); // not "−1 000 000 s left"
    const noWait = fail(2);
    expect(normalizeLockout(noWait, 0)).toEqual({ failures: 2, lockedUntil: 0, lastFailureAt: 0 });
  });

  it('survives serialisation and treats unreadable state as no failures', () => {
    const s = fail(6);
    expect(parseLockout(serializeLockout(s))).toEqual(s);
    for (const raw of [null, undefined, '', 'x', '[]', '42', '{"failures":"5"}', '{"failures":-3,"lockedUntil":null}']) {
      expect(parseLockout(raw)).toEqual(EMPTY_LOCKOUT);
    }
    expect(parseLockout('{"failures":5.7,"lockedUntil":1e20,"lastFailureAt":-1}')).toEqual({
      failures: 5,
      lockedUntil: 1e20,
      lastFailureAt: 0,
    });
  });

  it('formats the wait as m:ss (rounded up)', () => {
    expect([0, -5, 1, 999, 25_000, 59_001, 60_000, 299_001, 900_000].map(formatWait)).toEqual([
      '0:00',
      '0:00',
      '0:01',
      '0:01',
      '0:25',
      '1:00',
      '1:00',
      '5:00',
      '15:00',
    ]);
  });
});

describe('app lock policy', () => {
  const immediately: LockConfig = { enabled: true, timeoutSec: 0 };
  const oneMinute: LockConfig = { enabled: true, timeoutSec: 60 };
  const off: LockConfig = { enabled: false, timeoutSec: 0 };
  const T = 1_700_000_000_000;

  it('locks at launch only when the app lock is on', () => {
    expect(initialLockState(immediately)).toEqual({ locked: true, backgroundAt: null, autoPrompt: true });
    expect(initialLockState(off)).toEqual(UNLOCKED);
  });

  it('regression v1.3.0: Face ID prompt, Control Center and alerts (inactive) never relock', () => {
    let s: LockState = consumeAutoPrompt(initialLockState(immediately)); // the prompt is shown …
    s = onAppStateChange(s, 'inactive', immediately, T); // … and iOS reports "inactive"
    expect(s.locked).toBe(true);
    s = onUnlocked(s, 'inactive'); // Face ID succeeded
    expect(s).toEqual(UNLOCKED);
    s = onAppStateChange(s, 'active', immediately, T + 500); // prompt gone
    expect(s).toEqual(UNLOCKED);
    for (let i = 1; i <= 3; i++) {
      // Control Center, Notification Center, app-switcher peek …
      s = onAppStateChange(s, 'inactive', immediately, T + i * 1000);
      s = onAppStateChange(s, 'active', immediately, T + i * 1000 + 300);
      expect(s).toEqual(UNLOCKED);
    }
  });

  it('timeout "immediately": leaving the app locks it, the return asks once', () => {
    let s: LockState = UNLOCKED;
    s = onAppStateChange(s, 'inactive', immediately, T);
    s = onAppStateChange(s, 'background', immediately, T + 100);
    expect(s).toEqual({ locked: true, backgroundAt: T + 100, autoPrompt: true }); // app-switcher snapshot is locked
    s = onAppStateChange(s, 'inactive', immediately, T + 5000);
    s = onAppStateChange(s, 'active', immediately, T + 5100);
    expect(s).toEqual({ locked: true, backgroundAt: null, autoPrompt: true });
    s = consumeAutoPrompt(s); // Face ID shown once
    expect(s.autoPrompt).toBe(false);
    // the user cancels: the prompt itself makes the app inactive → active again
    s = onAppStateChange(s, 'inactive', immediately, T + 6000);
    s = onAppStateChange(s, 'active', immediately, T + 7000);
    expect(s).toEqual({ locked: true, backgroundAt: null, autoPrompt: false }); // no second automatic prompt
    s = onUnlocked(s, 'active');
    expect(s).toEqual(UNLOCKED);
  });

  it('timeout 1 min: short trips stay unlocked, longer ones lock', () => {
    let s = onAppStateChange(UNLOCKED, 'background', oneMinute, T);
    expect(s).toEqual({ locked: false, backgroundAt: T, autoPrompt: false });
    s = onAppStateChange(s, 'active', oneMinute, T + 30_000);
    expect(s).toEqual(UNLOCKED);

    s = onAppStateChange(UNLOCKED, 'background', oneMinute, T);
    s = onAppStateChange(s, 'background', oneMinute, T + 50_000); // repeated event keeps the first time
    expect(s.backgroundAt).toBe(T);
    expect(onAppStateChange(s, 'active', oneMinute, T + 59_999).locked).toBe(false);
    expect(onAppStateChange(s, 'active', oneMinute, T + 60_000)).toEqual({ locked: true, backgroundAt: null, autoPrompt: true });
    expect(onAppStateChange(s, 'active', oneMinute, T + 61_000).locked).toBe(true);
  });

  it('locks when the clock went backwards while away', () => {
    const s = onAppStateChange(UNLOCKED, 'background', oneMinute, T);
    expect(onAppStateChange(s, 'active', oneMinute, T - 1000).locked).toBe(true);
  });

  it('stays locked when already locked, even after a short trip', () => {
    const locked: LockState = { locked: true, backgroundAt: null, autoPrompt: false };
    let s = onAppStateChange(locked, 'background', oneMinute, T);
    s = onAppStateChange(s, 'active', oneMinute, T + 1000);
    expect(s).toEqual({ locked: true, backgroundAt: null, autoPrompt: true });
  });

  it('ignores an unlock that completes after the user left again', () => {
    const s = onAppStateChange(UNLOCKED, 'background', immediately, T);
    expect(onUnlocked(s, 'background')).toBe(s);
    expect(onUnlocked(s, 'active')).toEqual(UNLOCKED);
  });

  it('turning the lock off unlocks, turning it on keeps the open session', () => {
    const locked = initialLockState(immediately);
    expect(onConfigChange(locked, off)).toEqual(UNLOCKED);
    expect(onConfigChange(UNLOCKED, immediately)).toBe(UNLOCKED);
    expect(onAppStateChange(locked, 'background', off, T)).toEqual(UNLOCKED);
    expect(onAppStateChange(locked, 'active', off, T)).toEqual(UNLOCKED);
  });

  it('unknown / extension states change nothing', () => {
    const s = initialLockState(immediately);
    expect(onAppStateChange(s, 'unknown', immediately, T)).toBe(s);
    expect(onAppStateChange(s, 'extension', immediately, T)).toBe(s);
    expect(consumeAutoPrompt(UNLOCKED)).toBe(UNLOCKED);
  });
});
