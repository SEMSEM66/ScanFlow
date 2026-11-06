import { afterAll, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const SCRIPT = join(__dirname, '..', 'scripts', 'check-corners.mjs');

const run = (root: string) => spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'corners-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

describe('scripts/check-corners.mjs', () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it('passes for the app itself', () => {
    const res = run(join(__dirname, '..'));
    expect(res.stderr).toBe('');
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/check:corners – OK/);
  });

  it('accepts the theme helpers and primitives', () => {
    const root = fixture({
      'src/theme/shape.ts': "export const corner = (r: number) => ({ borderRadius: r, borderCurve: 'continuous' as const });\n",
      'app/screen.tsx': [
        "import { corner, capsule, radius } from '../src/theme';",
        '// borderRadius: 4 in a comment is fine',
        'const s = { card: { ...corner(radius.lg) }, pill: { ...capsule(32) } };',
        "const wrapper = { shadowColor: '#000', shadowOpacity: 0.1 };",
        "const clip = { overflow: 'hidden' };",
        '',
      ].join('\n'),
    });
    roots.push(root);
    const res = run(root);
    expect(res.status).toBe(0);
  });

  it('reports raw radii, missing borderCurve, Skia rounded rects, capsule hacks and clipped shadows', () => {
    const root = fixture({
      'app/bad.tsx': ['const a = {', '  borderRadius: 8,', '};', 'const b = { borderTopLeftRadius: 4 };', ''].join('\n'),
      'src/theme/helpers.ts': 'export const round = (r: number) => ({ borderRadius: r });\n',
      'src/components/Shape.tsx': '<RoundedRect x={0} y={0} width={10} height={10} r={4} />\n',
      'src/components/Pill.tsx': 'const p = corner(9999);\n',
      'src/components/Card.tsx': "const c = { overflow: 'hidden', shadowOpacity: 0.2 };\n",
    });
    roots.push(root);
    const res = run(root);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('6 problem(s)');
    expect(res.stderr).toContain('app/bad.tsx:2  borderRadius outside the theme helpers');
    expect(res.stderr).toContain('app/bad.tsx:4  borderTopLeftRadius outside the theme helpers');
    expect(res.stderr).toContain("src/theme/helpers.ts:1  borderRadius without borderCurve: 'continuous'");
    expect(res.stderr).toContain('src/components/Shape.tsx:1  rounded Skia shape (RoundedRect)');
    expect(res.stderr).toContain('src/components/Pill.tsx:1  capsule faked with a huge radius');
    expect(res.stderr).toContain("src/components/Card.tsx:1  overflow: 'hidden' and a shadow on the same view");
  });
});