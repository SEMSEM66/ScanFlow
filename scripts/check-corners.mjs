#!/usr/bin/env node
/**
 * Corner check (no dependencies): `npm run check:corners`.
 *
 * Shapes in ScanFlow come from the theme helpers (src/theme: corner(),
 * capsule(), corners(), concentric(), squirclePath()) and the UI primitives
 * built on them. This fails when code in app/ or src/
 *   1. sets a border radius (borderRadius, borderTopLeftRadius, …) outside src/theme,
 *   2. sets a border radius in src/theme without borderCurve in the same object,
 *   3. draws a rounded Skia shape (RoundedRect / RRect) outside src/theme
 *      instead of squirclePath(),
 *   4. fakes a capsule with a huge radius (corner(999)) instead of capsule(height),
 *   5. clips (overflow: 'hidden') and casts a shadow in the same style object
 *      (iOS cannot draw the shadow of a clipped layer – use a shadow wrapper).
 *
 * Usage: node scripts/check-corners.mjs [--root <dir>]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const ROOT = rootIndex >= 0 && args[rootIndex + 1] ? args[rootIndex + 1] : process.cwd();
const SCAN_DIRS = ['app', 'src'];
const THEME_DIR = ['src', 'theme'].join(sep) + sep;
const EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs)$/;

const RADIUS = /\bborder(?:Top|Bottom|Start|End)?(?:Left|Right|Start|End)?Radius\b/g;
const SKIA_ROUNDED = /\b(?:RoundedRect|RRect\w*|rrect)\b/g;
const CAPSULE_HACK = /\bcorner\(\s*9{3,}/g;
const OVERFLOW_HIDDEN = /\boverflow\s*:\s*['"]hidden['"]/g;
const SHADOW = /\b(?:shadowColor|shadowOpacity|shadowRadius|shadowOffset|elevation)\s*:/;

function listFiles(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out = out.concat(listFiles(full));
    else if (EXTENSIONS.test(name)) out.push(full);
  }
  return out;
}

/** Replaces comments with spaces (keeps strings, line breaks and offsets). */
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (ch === '/' && next === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < src.length) {
        out += '  ';
        i += 2;
      }
    } else if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (src[i] === '\n' && quote !== '`') break; // unterminated string: stop at the line end
        out += src[i];
        i++;
      }
      if (i < src.length) {
        out += src[i];
        i++;
      }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Range of the innermost `{ … }` around `index` (whole file when there is none). */
function enclosingBlock(code, index) {
  let depth = 0;
  let start = 0;
  for (let i = index; i >= 0; i--) {
    if (code[i] === '}') depth++;
    else if (code[i] === '{') {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  depth = 0;
  let end = code.length;
  for (let i = index; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      if (depth === 0) {
        end = i + 1;
        break;
      }
      depth--;
    }
  }
  return code.slice(start, end);
}

function lineOf(code, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (code[i] === '\n') line++;
  return line;
}

const problems = [];
const report = (file, code, index, message) => problems.push(`${relative(ROOT, file)}:${lineOf(code, index)}  ${message}`);

const files = SCAN_DIRS.flatMap((d) => listFiles(join(ROOT, d)));
for (const file of files) {
  const rel = relative(ROOT, file);
  const inTheme = rel.startsWith(THEME_DIR);
  const code = stripComments(readFileSync(file, 'utf8'));

  for (const m of code.matchAll(RADIUS)) {
    if (!inTheme) {
      report(file, code, m.index, `${m[0]} outside the theme helpers – use corner(), capsule(), corners() or a UI primitive`);
    } else if (!/\bborderCurve\b/.test(enclosingBlock(code, m.index))) {
      report(file, code, m.index, `${m[0]} without borderCurve: 'continuous'`);
    }
  }
  if (!inTheme) {
    for (const m of code.matchAll(SKIA_ROUNDED)) {
      report(file, code, m.index, `rounded Skia shape (${m[0]}) – draw it with squirclePath()`);
    }
  }
  for (const m of code.matchAll(CAPSULE_HACK)) {
    report(file, code, m.index, 'capsule faked with a huge radius – use capsule(height)');
  }
  for (const m of code.matchAll(OVERFLOW_HIDDEN)) {
    if (SHADOW.test(enclosingBlock(code, m.index))) {
      report(file, code, m.index, "overflow: 'hidden' and a shadow on the same view – put the shadow on a wrapper");
    }
  }
}

if (problems.length > 0) {
  console.error(`check:corners – ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`check:corners – OK (${files.length} files in ${SCAN_DIRS.join(', ')})`);