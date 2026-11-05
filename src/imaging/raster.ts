/**
 * Small, allocation-conscious raster helpers on Float32 planes.
 * Used by edge detection (≈300–400 px images) and background estimation (≈128 px).
 */

export type Plane = Float32Array;

export function luminance(data: Uint8Array | Uint8ClampedArray, width: number, height: number): Plane {
  const out = new Float32Array(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]) / 255;
  }
  return out;
}

/** Separable box blur with replicated borders (radius r → window 2r+1), O(n). */
export function boxBlur(src: Plane, width: number, height: number, r: number): Plane {
  if (r <= 0) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const win = 2 * r + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + clampI(k, 0, width - 1)];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = acc / win;
      acc += src[row + clampI(x + r + 1, 0, width - 1)] - src[row + clampI(x - r, 0, width - 1)];
    }
  }
  for (let x = 0; x < width; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[clampI(k, 0, height - 1) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = acc / win;
      acc += tmp[clampI(y + r + 1, 0, height - 1) * width + x] - tmp[clampI(y - r, 0, height - 1) * width + x];
    }
  }
  return out;
}

/** Square max (dilate) or min (erode) filter, separable, replicated borders. */
export function rankFilter(src: Plane, width: number, height: number, r: number, mode: 'max' | 'min'): Plane {
  if (r <= 0) return src.slice();
  const pick = mode === 'max' ? Math.max : Math.min;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let v = src[row + x];
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width - 1, x + r);
      for (let k = x0; k <= x1; k++) v = pick(v, src[row + k]);
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let v = tmp[y * width + x];
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(height - 1, y + r);
      for (let k = y0; k <= y1; k++) v = pick(v, tmp[k * width + x]);
      out[y * width + x] = v;
    }
  }
  return out;
}

/** 5-tap binomial blur (σ ≈ 1), applied `passes` times. */
export function gaussianBlur(src: Plane, width: number, height: number, passes = 1): Plane {
  let cur = src;
  const k = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(cur.length);
    const out = new Float32Array(cur.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let s = 0;
        for (let i = -2; i <= 2; i++) s += k[i + 2] * cur[y * width + clampI(x + i, 0, width - 1)];
        tmp[y * width + x] = s;
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let s = 0;
        for (let i = -2; i <= 2; i++) s += k[i + 2] * tmp[clampI(y + i, 0, height - 1) * width + x];
        out[y * width + x] = s;
      }
    }
    cur = out;
  }
  return cur;
}

/** Otsu threshold of a 0…1 plane (256 bins). */
export function otsuThreshold(src: Plane): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < src.length; i++) hist[clampI(Math.round(src[i] * 255), 0, 255)]++;
  const total = src.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestT = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return (bestT + 0.5) / 255;
}

export function percentile(src: Plane, p: number): number {
  const sorted = Float32Array.from(src).sort();
  return sorted[clampI(Math.floor(p * (sorted.length - 1)), 0, sorted.length - 1)];
}

/**
 * Labels 4-connected components of `mask` (1 = foreground).
 * Returns labels (0 = background) and per-label pixel counts (index = label).
 */
export function connectedComponents(mask: Uint8Array, width: number, height: number): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(mask.length);
  const sizes: number[] = [0];
  const stack = new Int32Array(mask.length);
  let next = 1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i]) continue;
    let sp = 0;
    stack[sp++] = i;
    labels[i] = next;
    let count = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      count++;
      const x = idx % width;
      const y = (idx - x) / width;
      if (x > 0 && mask[idx - 1] && !labels[idx - 1]) { labels[idx - 1] = next; stack[sp++] = idx - 1; }
      if (x < width - 1 && mask[idx + 1] && !labels[idx + 1]) { labels[idx + 1] = next; stack[sp++] = idx + 1; }
      if (y > 0 && mask[idx - width] && !labels[idx - width]) { labels[idx - width] = next; stack[sp++] = idx - width; }
      if (y < height - 1 && mask[idx + width] && !labels[idx + width]) { labels[idx + width] = next; stack[sp++] = idx + width; }
    }
    sizes.push(count);
    next++;
  }
  return { labels, sizes };
}

/** Flood fill (4-conn) over `passable` pixels starting from every border pixel. */
export function floodFromBorder(passable: Uint8Array, width: number, height: number, limit?: Uint8Array): Uint8Array {
  const reached = new Uint8Array(passable.length);
  const stack = new Int32Array(passable.length);
  let sp = 0;
  const push = (i: number) => {
    if (passable[i] && !reached[i] && (!limit || limit[i])) {
      reached[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (sp > 0) {
    const idx = stack[--sp];
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) push(idx - 1);
    if (x < width - 1) push(idx + 1);
    if (y > 0) push(idx - width);
    if (y < height - 1) push(idx + width);
  }
  return reached;
}

export function dilateMask(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  const f = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) f[i] = mask[i];
  const d = rankFilter(f, width, height, r, 'max');
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = d[i] > 0.5 ? 1 : 0;
  return out;
}

export function erodeMask(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  const f = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) f[i] = mask[i];
  const d = rankFilter(f, width, height, r, 'min');
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = d[i] > 0.5 ? 1 : 0;
  return out;
}

export function clampI(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
