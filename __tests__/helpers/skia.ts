/// <reference types="node" />
import path from 'path';
import type { SkiaApi } from '../../src/imaging/renderer';

/* eslint-disable @typescript-eslint/no-require-imports */
let cached: { Skia: SkiaApi; enums: Record<string, Record<string, number>> } | null = null;

/** Loads the headless (CanvasKit/WASM) build of @shopify/react-native-skia. */
export async function loadHeadlessSkia() {
  if (cached) return cached;
  const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit');
  const dir = path.join(path.dirname(require.resolve('canvaskit-wasm/package.json')), 'bin', 'full');
  (globalThis as unknown as { CanvasKit: unknown }).CanvasKit = await CanvasKitInit({
    locateFile: (f: string) => path.join(dir, f),
  });
  const headless = require('@shopify/react-native-skia/lib/commonjs/headless');
  cached = { Skia: headless.getSkiaExports().Skia as SkiaApi, enums: headless };
  return cached;
}
