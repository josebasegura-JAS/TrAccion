// Diagnóstico de duración de Vitest sin cambiar pruebas, cobertura ni paralelismo.
// Lee el JSON producido por el reporter oficial de Vitest (--reporter=json).
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'audit-results');
mkdirSync(output, { recursive: true });
const jsonPath = path.join(output, 'vitest.json');
const elapsedPath = path.join(output, 'vitest-elapsed-seconds.txt');
const total = existsSync(elapsedPath) ? Number(readFileSync(elapsedPath, 'utf8').trim()) : null;
const validTotal = Number.isFinite(total) && total >= 0 ? total : null;
const slash = (value) => String(value ?? '').replaceAll('\\', '/');
const relative = (value) => {
  const name = slash(value);
  const base = slash(root).replace(/\/$/, '') + '/';
  return name.startsWith(base) ? name.slice(base.length) : name;
};
const fmt = (value) => Number.isFinite(value) ? value.toFixed(2) : 'n/d';
const report = [];
report.push('# Diagnóstico Vitest — ejecución actual');
report.push('');
report.push('Mediciones del runner actual, en segundos. La duración de los archivos puede incluir preparación, carga y ejecución; no representa exclusivamente las funciones de test.');
report.push('');
report.push(`**Tiempo total de npm run test:coverage:** ${fmt(validTotal)} s`);
report.push('');
let parsed;
if (existsSync(jsonPath)) {
  try { parsed = JSON.parse(readFileSync(jsonPath, 'utf8')); }
  catch (error) { report.push(`No se pudo analizar vitest.json: ${String(error)}`); }
} else {
  report.push('No se generó vitest.json; revisar los registros de Vitest (puede haber fallado antes de producir el informe).');
}
if (parsed) {
  const suites = Array.isArray(parsed.testResults) ? parsed.testResults : [];
  const rows = suites.map((suite) => {
    const begin = Number(suite.startTime);
    const end = Number(suite.endTime);
    const duration = Number.isFinite(begin) && Number.isFinite(end) && end >= begin
      ? (end - begin) / 1000
      : null;
    const cases = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
    return {
      file: relative(suite.name),
      seconds: duration,
      tests: cases.length,
      failed: cases.filter((item) => item.status === 'failed').length,
      status: suite.status ?? 'desconocido',
    };
  });
  rows.sort((a, b) => (b.seconds ?? -1) - (a.seconds ?? -1) || a.file.localeCompare(b.file));
  const count = rows.reduce((sum, r) => sum + r.tests, 0);
  report.push(`**Archivos contabilizados:** ${rows.length} · **Tests declarados:** ${count} · **Fallidos:** ${rows.reduce((sum, r) => sum + r.failed, 0)}`);
  report.push('');
  report.push('| Archivo | Duración (s) | Tests | Fallidos | Estado |');
  report.push('|---|---:|---:|---:|---|');
  for (const r of rows) {
    report.push(`| ${r.file.replaceAll('|', '\\|')} | ${fmt(r.seconds)} | ${r.tests} | ${r.failed} | ${r.status} |`);
  }
  if (rows.length === 0) report.push('| Sin archivos en el informe | n/d | 0 | 0 | n/d |');
  report.push('');
  report.push('Nota: las duraciones por archivo no deben sumarse para inferir el coste de cobertura. El total del comando incluye instrumentación, informes y otros gastos; para separar el coste de cobertura hace falta una medición comparativa independiente.');
  writeFileSync(path.join(output, 'vitest-timing.json'), JSON.stringify({ totalSeconds: validTotal, files: rows }, null, 2) + '\n');
}
const markdown = report.join('\n') + '\n';
writeFileSync(path.join(output, 'vitest-timing.md'), markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
