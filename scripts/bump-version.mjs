// Incrementa automáticamente el número de build de TrAccion antes de generar
// el portable. La línea de distribución MAJOR.MINOR se deriva después desde
// package.json.version; este script solo mantiene la versión técnica.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseTechnicalVersion } from './release-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageLockPath = path.join(__dirname, '..', 'package-lock.json');
const buildCounterPath = path.join(__dirname, '..', '.build-version');

const previousBuildNumber = existsSync(buildCounterPath)
  ? Number.parseInt(readFileSync(buildCounterPath, 'utf8').trim(), 10)
  : -1;

if (Number.isNaN(previousBuildNumber)) {
  throw new Error(`El contenido de ${buildCounterPath} no es un número válido.`);
}

const nextBuildNumber = previousBuildNumber + 1;
writeFileSync(buildCounterPath, `${nextBuildNumber}\n`);

const raw = readFileSync(packageJsonPath, 'utf8');
const pkg = JSON.parse(raw);
const { major, minor } = parseTechnicalVersion(pkg.version);

pkg.version = `${major}.${minor}.${nextBuildNumber}`;
writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

if (existsSync(packageLockPath)) {
  const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'));
  packageLock.version = pkg.version;
  if (packageLock.packages?.['']) packageLock.packages[''].version = pkg.version;
  writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`);
}

console.log(`Build nº ${String(nextBuildNumber).padStart(2, '0')}`);
console.log(`Versión de la app (package.json.version): ${pkg.version}`);
