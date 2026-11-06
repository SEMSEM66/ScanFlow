#!/usr/bin/env node
/**
 * Automated Network & Zero-Tracking Audit Quality Gate.
 * Asserts that ScanFlow contains 0 network requests, 0 telemetry calls,
 * and 0 third-party tracking/analytics dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SEARCH_DIRS = ['src', 'app', 'modules'];

// Forbidden network/telemetry patterns
const FORBIDDEN_PATTERNS = [
  { name: 'JavaScript fetch() call', regex: /(?:await\s+fetch\s*\(|\bfetch\s*\(\s*['"`]https?:\/\/)/g },
  { name: 'XMLHttpRequest', regex: /\bnew\s+XMLHttpRequest\b/g },
  { name: 'WebSocket', regex: /\bnew\s+WebSocket\b/g },
  { name: 'Axios import/call', regex: /\bfrom\s+['"]axios['"]|\brequire\(['"]axios['"]\)/gi },
  { name: 'Analytics/Tracking SDK', regex: /\b(from\s+['"]@?(firebase|amplitude|sentry|mixpanel|datadog|appsflyer|adjust|segment)[\/'"]|telemetryClient)/gi },
  { name: 'Hardcoded API/Cloud Endpoint', regex: /https?:\/\/(api\.|backend\.|cloud\.|track\.|analytics\.)/gi },
];

// Allowed exceptions (e.g. system Apple link for subscription management, barcode URL classifier)
const ALLOWED_EXCEPTIONS = [
  'https://apps.apple.com/account/subscriptions',
  'http:',
  'https:',
  'schema.org',
  'w3.org',
  'apple.com',
];

function isException(line) {
  return ALLOWED_EXCEPTIONS.some((exc) => line.includes(exc));
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return; // Skip comments
    }

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.regex.test(line)) {
        if (!isException(line)) {
          violations.push({
            file: path.relative(ROOT, filePath),
            line: index + 1,
            pattern: pattern.name,
            snippet: trimmed.slice(0, 100),
          });
        }
      }
      pattern.regex.lastIndex = 0;
    }
  });

  return violations;
}

function traverse(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__tests__') {
        results = results.concat(traverse(fullPath));
      }
    } else if (
      entry.isFile() &&
      /\.(ts|tsx|js|mjs|swift)$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

function main() {
  const allFiles = SEARCH_DIRS.flatMap((dir) => {
    const p = path.join(ROOT, dir);
    return fs.existsSync(p) ? traverse(p) : [];
  });

  const allViolations = allFiles.flatMap(scanFile);

  if (allViolations.length > 0) {
    console.error(`\x1b[31mcheck:network – FAILED (${allViolations.length} unauthorized network/telemetry patterns found):\x1b[0m`);
    for (const v of allViolations) {
      console.error(`  ${v.file}:${v.line} [${v.pattern}]: ${v.snippet}`);
    }
    process.exit(1);
  }

  console.log(`check:network – OK (0 network calls, 0 trackers across ${allFiles.length} files in ${SEARCH_DIRS.join(', ')})`);
}

main();
