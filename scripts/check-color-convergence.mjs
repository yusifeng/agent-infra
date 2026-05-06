#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const cliArgs = process.argv.slice(2);

const targets = [];
const allowedFiles = new Set();

for (let index = 0; index < cliArgs.length; index += 1) {
  const value = cliArgs[index];

  if (value === '--allow-file') {
    const nextValue = cliArgs[index + 1];
    if (!nextValue) {
      throw new Error('Missing path after --allow-file');
    }
    allowedFiles.add(normalizePath(nextValue));
    index += 1;
    continue;
  }

  targets.push(normalizePath(value));
}

if (targets.length === 0) {
  targets.push(normalizePath('apps/playground-vite-web/src'));
}

if (allowedFiles.size === 0) {
  allowedFiles.add(normalizePath('apps/playground-vite-web/src/theme.css'));
}

const colorFunctionPattern = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([^)\n]+\)/g;
const hexColorPattern = /#[0-9a-fA-F]{3,8}\b/g;
const tailwindPalettePattern =
  /\b(?:bg|text|border|ring|stroke|fill|outline|placeholder|decoration|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\/(?:0|5|10|12|15|20|25|30|35|40|45|50|55|60|65|70|75|80|85|90|95|100))?\b/g;
const fileExtensions = new Set(['.css', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ignoredDirectories = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turbo']);

const violations = [];

for (const target of targets) {
  const absoluteTarget = path.resolve(cwd, target);
  const targetStat = await stat(absoluteTarget);

  if (targetStat.isDirectory()) {
    await walkDirectory(absoluteTarget);
    continue;
  }

  await inspectFile(absoluteTarget);
}

if (violations.length === 0) {
  console.log('Color convergence check passed. No disallowed hardcoded colors found.');
  process.exit(0);
}

console.error(`Color convergence check failed with ${violations.length} violation(s):`);
for (const violation of violations) {
  console.error(`${violation.file}:${violation.line} [${violation.rule}] ${violation.match}`);
}
process.exit(1);

async function walkDirectory(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(entryPath);
      continue;
    }

    if (fileExtensions.has(path.extname(entry.name))) {
      await inspectFile(entryPath);
    }
  }
}

async function inspectFile(filePath) {
  const relativePath = normalizePath(path.relative(cwd, filePath));
  if (allowedFiles.has(relativePath)) {
    return;
  }

  const source = await readFile(filePath, 'utf8');
  const lines = source.split('\n');

  inspectPattern(lines, relativePath, hexColorPattern, 'hex-color');
  inspectPattern(lines, relativePath, colorFunctionPattern, 'color-function');
  inspectPattern(lines, relativePath, tailwindPalettePattern, 'tailwind-palette');
}

function inspectPattern(lines, relativePath, pattern, rule) {
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];
    for (const match of line.matchAll(pattern)) {
      violations.push({
        file: relativePath,
        line: lineNumber + 1,
        match: match[0],
        rule
      });
    }
  }
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}
