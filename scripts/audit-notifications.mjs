#!/usr/bin/env node
/**
 * Inventario estático de candidatos a notificaciones.
 * No modifica código de producto, no ejecuta la aplicación y no considera
 * cada coincidencia un aviso real: requiere revisión funcional.
 *
 * Uso: node scripts/audit-notifications.mjs [--json ruta] [--md ruta]
 */
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const jsonFile = option('--json', 'audit-results/notifications-inventory.json');
const mdFile = option('--md', 'audit-results/notifications-inventory.md');
const patterns = [
  ['toast', /\btoast\.(success|error|warning|info)\s*\(/g],
  ['modal', /\b(?:alert|confirm|showAlert|showConfirm)\s*\(/g],
  ['nativo', /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/g],
  ['persistencia', /\b(?:emitPersistenceFeedback|publishPersistenceBusy|clearPersistenceBusy|subscribeToPersistenceFeedback)\s*\(/g],
  ['estado-local', /\b(?:set(?:Error|Warning|Message|SaveStatus|Feedback|Notice|Notification|ImportMessage|Status)|role\s*=\s*["']alert["'])/g],
  ['registro-tecnico', /\bconsole\.(?:error|warn)\s*\(/g],
];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const excluded = /(?:^|\/)(?:node_modules|dist|dist-electron|coverage|audit-results|test-results|playwright-report|\.git)(?:\/|$)/;
const testFile = /(?:^|\/)(?:__tests__|tests|e2e)(?:\/)|(?:\.test|\.spec)\.[jt]sx?$/;
const files = [];
async function walk(dir) {
  let entries;
  try { entries = await readdir(join(root, dir), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const normalized = path.replaceAll('\\', '/');
    if (excluded.test(normalized)) continue;
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && extensions.has(extname(entry.name)) && !testFile.test(normalized)) files.push(path);
  }
}
await walk('src');
await walk('electron');
const matches = [];
for (const file of files.sort()) {
  const lines = (await readFile(join(root, file), 'utf8')).split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index].trim();
    for (const [kind, pattern] of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        matches.push({ file: relative(root, join(root, file)).replaceAll('\\', '/'), line: index + 1, kind, snippet: text.slice(0, 240), review: 'pendiente' });
      }
    }
  }
}
const byKind = Object.fromEntries(patterns.map(([kind]) => [kind, matches.filter(item => item.kind === kind).length]));
const result = {
  schemaVersion: 1,
  note: 'Coincidencias heurísticas, no recuento validado de avisos. Algunos mensajes multilinea y componentes JSX propios requieren revisión manual.',
  scannedFiles: files.length,
  candidateOccurrences: matches.length,
  byKind,
  matches,
};
const escapeCell = value => String(value).replaceAll('|', '\\|').replaceAll('\\n', ' ');
const markdown = [
  '# Inventario automático de candidatos a notificaciones',
  '',
  '> Generado por `node scripts/audit-notifications.mjs`. Los resultados son candidatos: no equivalen a avisos únicos ni a defectos demostrados.',
  '',
  `Archivos analizados: **${files.length}** · Coincidencias: **${matches.length}**.`,
  '',
  '| Mecanismo | Coincidencias |', '|---|---:|',
  ...Object.entries(byKind).map(([kind, count]) => `| ${kind} | ${count} |`),
  '',
  '## Candidatos por ubicación',
  '',
  '| Archivo | Línea | Mecanismo | Evidencia |', '|---|---:|---|---|',
  ...matches.map(item => `| ${escapeCell(item.file)} | ${item.line} | ${item.kind} | \`${escapeCell(item.snippet).replaceAll('`', "'") }\` |`),
  '',
].join('\n');
for (const [path, value] of [[jsonFile, JSON.stringify(result, null, 2) + '\n'], [mdFile, markdown]]) {
  const destination = join(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, value, 'utf8');
}
console.log(`Inventario: ${files.length} archivos, ${matches.length} coincidencias. JSON: ${jsonFile}. Markdown: ${mdFile}.`);
