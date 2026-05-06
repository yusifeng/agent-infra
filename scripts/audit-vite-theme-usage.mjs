#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const srcRoot = path.resolve(cwd, 'apps/playground-vite-web/src');
const themePath = path.resolve(srcRoot, 'theme.css');
const indexCssPath = path.resolve(srcRoot, 'index.css');
const fileExtensions = new Set(['.css', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ignoredDirectories = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turbo']);

const themeSource = await readFile(themePath, 'utf8');
const indexSource = await readFile(indexCssPath, 'utf8');
const projectFiles = await collectFiles(srcRoot);

const themeVars = dedupeVariableDefinitions(extractCssVariableDefinitions(themeSource));
const inlineThemeAliases = extractInlineThemeAliases(indexSource);

const codeFiles = projectFiles.filter((file) => file !== themePath && file !== indexCssPath);
const fileContents = new Map(
  await Promise.all(codeFiles.map(async (file) => [file, await readFile(file, 'utf8')]))
);

const aliasUsage = inlineThemeAliases.map((alias) => ({
  alias,
  usedBy: findAliasUsage(alias, fileContents)
}));

const usedAliases = new Set(aliasUsage.filter((entry) => entry.usedBy.length > 0).map((entry) => entry.alias.name));
const themeUsage = themeVars.map((variable) => ({
  variable,
  usedBy: findThemeVarUsage(variable, fileContents, inlineThemeAliases, usedAliases)
}));

const report = {
  unusedThemeVariables: themeUsage
    .filter((entry) => entry.usedBy.length === 0)
    .map((entry) => entry.variable.name)
    .sort(),
  unusedInlineThemeAliases: aliasUsage
    .filter((entry) => entry.usedBy.length === 0)
    .map((entry) => entry.alias.name)
    .sort()
};

console.log(JSON.stringify(report, null, 2));

async function collectFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await collectFiles(entryPath));
      continue;
    }

    if (fileExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function extractCssVariableDefinitions(source) {
  return [...source.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => ({
    name: match[1],
    references: extractVarReferencesForDefinition(source, match.index ?? 0)
  }));
}

function dedupeVariableDefinitions(definitions) {
  const byName = new Map();

  for (const definition of definitions) {
    const current = byName.get(definition.name);
    if (!current) {
      byName.set(definition.name, {
        name: definition.name,
        references: [...definition.references]
      });
      continue;
    }

    current.references = [...new Set([...current.references, ...definition.references])];
  }

  return [...byName.values()];
}

function extractInlineThemeAliases(source) {
  return [...source.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*var\((--[a-z0-9-]+)\)/gim)].map((match) => ({
    name: match[1],
    sourceVar: match[2]
  }));
}

function extractVarReferencesForDefinition(source, startIndex) {
  const endIndex = source.indexOf(';', startIndex);
  const declaration = source.slice(startIndex, endIndex === -1 ? undefined : endIndex);
  return [...declaration.matchAll(/var\((--[a-z0-9-]+)\)/gim)].map((match) => match[1]);
}

function findAliasUsage(alias, contentsByFile) {
  const results = [];
  const token = toThemeToken(alias.name);
  const patterns = [
    new RegExp(`var\\(${escapeRegex(alias.name)}\\)`)
  ];

  if (token.type === 'color') {
    patterns.push(
      new RegExp(
        `\\b(?:bg|text|border|ring|outline|fill|stroke|decoration|placeholder|from|via|to)-${escapeRegex(token.name)}(?:\\b|[/'"\\]\\s])`,
      )
    );
  }

  if (token.type === 'radius') {
    patterns.push(new RegExp(`var\\(${escapeRegex(alias.name)}\\)`));
  }

  if (token.type === 'font') {
    patterns.push(new RegExp(`\\bfont-${escapeRegex(token.name)}\\b`));
  }

  for (const [file, content] of contentsByFile.entries()) {
    if (patterns.some((pattern) => pattern.test(content))) {
      results.push(relative(file));
    }
  }

  return results;
}

function findThemeVarUsage(variable, contentsByFile, aliases, usedAliases) {
  const directMatches = [];
  const directPattern = new RegExp(`var\\(${escapeRegex(variable.name)}\\)`);

  for (const [file, content] of contentsByFile.entries()) {
    if (directPattern.test(content)) {
      directMatches.push(relative(file));
    }
  }

  const aliasMatches = aliases
    .filter((alias) => alias.sourceVar === variable.name && usedAliases.has(alias.name))
    .map((alias) => `${alias.name} (via @theme inline)`);

  return [...directMatches, ...aliasMatches];
}

function toThemeToken(aliasName) {
  if (aliasName.startsWith('--color-')) {
    return { type: 'color', name: aliasName.slice('--color-'.length) };
  }

  if (aliasName.startsWith('--radius-')) {
    return { type: 'radius', name: aliasName.slice('--radius-'.length) };
  }

  if (aliasName.startsWith('--font-')) {
    return { type: 'font', name: aliasName.slice('--font-'.length) };
  }

  return { type: 'other', name: aliasName.replace(/^--/, '') };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function relative(filePath) {
  return path.relative(cwd, filePath).split(path.sep).join('/');
}
