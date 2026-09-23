// Genera un ZIP de publicación para la autoactualización de TrAccion.
// El ZIP contiene únicamente el portable .exe y version.json. No genera
// ningún .piz: al publicar en la carpeta de red, el .exe se renombra
// manualmente a .piz. El manifiesto ya referencia ese nombre .piz.

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..');
const packageJsonPath = path.join(projectDir, 'package.json');
const releaseDir = path.join(projectDir, 'release');
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

if (!pkg.version) throw new Error('package.json no tiene un campo "version".');
if (!existsSync(releaseDir)) mkdirSync(releaseDir, { recursive: true });

const artifactName = pkg.build?.portable?.artifactName;
if (!artifactName || typeof artifactName !== 'string' || !artifactName.toLowerCase().endsWith('.exe')) {
  throw new Error('package.json no contiene build.portable.artifactName válido.');
}

const sourceExePath = path.join(releaseDir, artifactName);
if (!existsSync(sourceExePath)) {
  throw new Error(`No se ha encontrado el portable generado: ${sourceExePath}`);
}

// El hash es idéntico antes y después de cambiar únicamente la extensión.
const sha256 = createHash('sha256').update(readFileSync(sourceExePath)).digest('hex');
const networkFileName = artifactName.replace(/\.exe$/i, '.piz');
const manifest = {
  version: pkg.version,
  file: networkFileName,
  sha256,
  mandatory: false,
  notes: '',
};

const stagingDir = path.join(releaseDir, `.update-package-${pkg.version}`);
const stagingExePath = path.join(stagingDir, artifactName);
const stagingManifestPath = path.join(stagingDir, 'version.json');
const zipName = `TrAccion-update-V${pkg.version}.zip`;
const zipPath = path.join(releaseDir, zipName);

rmSync(stagingDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(stagingDir, { recursive: true });
copyFileSync(sourceExePath, stagingExePath);
writeFileSync(stagingManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

try {
  if (process.platform === 'win32') {
    const ps = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${stagingExePath.replaceAll("'", "''")}', '${stagingManifestPath.replaceAll("'", "''")}' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`,
      ],
      { stdio: 'inherit' },
    );
    if (ps.status !== 0) throw new Error(`PowerShell Compress-Archive terminó con código ${ps.status ?? 'desconocido'}.`);
  } else {
    // Facilita validación/desarrollo fuera de Windows. El build portable real
    // se ejecuta en Windows, donde se usa Compress-Archive.
    const zip = spawnSync('zip', ['-j', '-q', zipPath, stagingExePath, stagingManifestPath], { stdio: 'inherit' });
    if (zip.status !== 0) throw new Error(`zip terminó con código ${zip.status ?? 'desconocido'}.`);
  }
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}

if (!existsSync(zipPath)) throw new Error(`No se ha podido generar ${zipPath}`);

console.log(`Paquete de publicación: ${zipPath}`);
console.log(`Contiene: ${artifactName} + version.json`);
console.log(`Al publicar, renombra ${artifactName} como ${networkFileName}.`);
console.log(`SHA-256: ${sha256}`);
