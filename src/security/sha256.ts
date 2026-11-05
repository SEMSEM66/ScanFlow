/**
 * Dependency-free SHA-256, HMAC-SHA256 and PBKDF2-HMAC-SHA256
 * (FIPS 180-4, RFC 2104, RFC 8018).
 *
 * Expo Go has no native PBKDF2 without an extra module, so the ScanFlow PIN
 * is hashed in JS. Verified against Node's `crypto` in
 * __tests__/security.test.ts – do not "optimise" without running those tests.
 */

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const IV = new Int32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/** Message schedule scratch space (single-threaded JS → one shared buffer is safe). */
const W = new Int32Array(64);

/** Processes 16 big-endian words already in W[0..15] into `state`. */
function compressW(state: Int32Array): void {
  for (let i = 16; i < 64; i++) {
    const w15 = W[i - 15];
    const w2 = W[i - 2];
    const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
    const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  state[0] = (state[0] + a) | 0;
  state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0;
  state[3] = (state[3] + d) | 0;
  state[4] = (state[4] + e) | 0;
  state[5] = (state[5] + f) | 0;
  state[6] = (state[6] + g) | 0;
  state[7] = (state[7] + h) | 0;
}

function compressBlock(state: Int32Array, block: Uint8Array, offset: number): void {
  for (let i = 0; i < 16; i++) {
    const j = offset + i * 4;
    W[i] = (block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3];
  }
  compressW(state);
}

/** Streaming SHA-256 state (used for HMAC with pre-computed key pads). */
class Sha256 {
  readonly state: Int32Array;
  private readonly buffer = new Uint8Array(64);
  private bufferLength = 0;
  private bytes: number;

  /** `state` / `absorbedBytes`: continue from a chaining state (HMAC key pads). */
  constructor(state: Int32Array = IV, absorbedBytes: number = 0) {
    this.state = new Int32Array(state);
    this.bytes = absorbedBytes;
  }

  update(data: Uint8Array): this {
    let offset = 0;
    this.bytes += data.length;
    if (this.bufferLength > 0) {
      const take = Math.min(64 - this.bufferLength, data.length);
      this.buffer.set(data.subarray(0, take), this.bufferLength);
      this.bufferLength += take;
      offset = take;
      if (this.bufferLength < 64) return this;
      compressBlock(this.state, this.buffer, 0);
      this.bufferLength = 0;
    }
    while (data.length - offset >= 64) {
      compressBlock(this.state, data, offset);
      offset += 64;
    }
    if (offset < data.length) {
      this.buffer.set(data.subarray(offset), 0);
      this.bufferLength = data.length - offset;
    }
    return this;
  }

  digest(): Uint8Array {
    const bitsHigh = Math.floor(this.bytes / 0x20000000);
    const bitsLow = (this.bytes << 3) >>> 0;
    const padLength = this.bufferLength < 56 ? 56 - this.bufferLength : 120 - this.bufferLength;
    const pad = new Uint8Array(padLength + 8);
    pad[0] = 0x80;
    pad[padLength] = bitsHigh >>> 24;
    pad[padLength + 1] = bitsHigh >>> 16;
    pad[padLength + 2] = bitsHigh >>> 8;
    pad[padLength + 3] = bitsHigh;
    pad[padLength + 4] = bitsLow >>> 24;
    pad[padLength + 5] = bitsLow >>> 16;
    pad[padLength + 6] = bitsLow >>> 8;
    pad[padLength + 7] = bitsLow;
    this.update(pad);
    return wordsToBytes(this.state);
  }
}

function wordsToBytes(words: Int32Array): Uint8Array {
  const out = new Uint8Array(words.length * 4);
  for (let i = 0; i < words.length; i++) {
    out[i * 4] = words[i] >>> 24;
    out[i * 4 + 1] = words[i] >>> 16;
    out[i * 4 + 2] = words[i] >>> 8;
    out[i * 4 + 3] = words[i];
  }
  return out;
}

export function sha256(data: Uint8Array): Uint8Array {
  return new Sha256().update(data).digest();
}

/** Chaining states after absorbing (key ⊕ ipad) and (key ⊕ opad). */
function hmacStates(key: Uint8Array): { inner: Int32Array; outer: Int32Array } {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha256(key) : key);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = block[i] ^ 0x36;
    opad[i] = block[i] ^ 0x5c;
  }
  const inner = new Int32Array(IV);
  const outer = new Int32Array(IV);
  compressBlock(inner, ipad, 0);
  compressBlock(outer, opad, 0);
  return { inner, outer };
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const { inner, outer } = hmacStates(key);
  // The 64-byte pad blocks are already absorbed into the chaining states.
  const innerDigest = new Sha256(inner, 64).update(data).digest();
  return new Sha256(outer, 64).update(innerDigest).digest();
}

/**
 * HMAC of a 32-byte message from pre-computed pad states: one compression
 * for the inner and one for the outer hash (message + padding fit one block).
 * Reads the 8 message words from `msg`, writes the 8 result words to `out`
 * (`msg` and `out` may be the same array).
 */
function hmac32(inner: Int32Array, outer: Int32Array, msg: Int32Array, out: Int32Array): void {
  const s = out;
  // inner: H(ipadState, msg ‖ 0x80 ‖ 0… ‖ len=(64+32)*8 bits) – read msg first, it may alias out
  for (let i = 0; i < 8; i++) W[i] = msg[i];
  s.set(inner);
  W[8] = 0x80000000 | 0;
  for (let i = 9; i < 15; i++) W[i] = 0;
  W[15] = (64 + 32) * 8;
  compressW(s);
  // outer: H(opadState, innerDigest ‖ padding)
  for (let i = 0; i < 8; i++) W[i] = s[i];
  W[8] = 0x80000000 | 0;
  for (let i = 9; i < 15; i++) W[i] = 0;
  W[15] = (64 + 32) * 8;
  s.set(outer);
  compressW(s);
}

/** PBKDF2-HMAC-SHA256 (RFC 8018 §5.2). */
export function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number = 32
): Uint8Array {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('pbkdf2: invalid iteration count');
  if (!Number.isInteger(keyLength) || keyLength < 1) throw new Error('pbkdf2: invalid key length');
  const { inner, outer } = hmacStates(password);
  const blocks = Math.ceil(keyLength / 32);
  const out = new Uint8Array(blocks * 32);
  const u = new Int32Array(8);
  const t = new Int32Array(8);
  const saltBlock = new Uint8Array(salt.length + 4);
  saltBlock.set(salt);
  for (let block = 1; block <= blocks; block++) {
    saltBlock[salt.length] = block >>> 24;
    saltBlock[salt.length + 1] = block >>> 16;
    saltBlock[salt.length + 2] = block >>> 8;
    saltBlock[salt.length + 3] = block;
    // U1 = HMAC(P, S ‖ INT(block)) – generic path (salt may be any length)
    const first = hmacSha256(password, saltBlock);
    for (let i = 0; i < 8; i++) {
      const j = i * 4;
      u[i] = (first[j] << 24) | (first[j + 1] << 16) | (first[j + 2] << 8) | first[j + 3];
    }
    t.set(u);
    for (let n = 1; n < iterations; n++) {
      hmac32(inner, outer, u, u);
      for (let i = 0; i < 8; i++) t[i] ^= u[i];
    }
    out.set(wordsToBytes(t), (block - 1) * 32);
  }
  return out.subarray(0, keyLength);
}

/** UTF-8 encoding without relying on TextEncoder (not guaranteed in every JS runtime). */
export function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return Uint8Array.from(bytes);
}

export function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return hex;
}

/** Strict lower/upper-case hex → bytes; null for anything else. */
export function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** Comparison whose duration does not depend on where the inputs differ. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
