// Genera el paquete de red y version.json. La versión visible (1.2) queda
// separada de la revisión técnica (1.2.xx), usada para decidir actualizaciones.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..');
const releaseDir = path.join(projectDir, 'release');
const pkg = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(String(pkg.version ?? ''))) throw new Error('package.json no contiene una versión técnica válida x.y.z.');
const artifactName = pkg.build?.portable?.artifactName;
if (!artifactName || typeof artifactName !== 'string' || !artifactName.toLowerCase().endsWith('.exe')) throw new Error('package.json no contiene build.portable.artifactName válido.');
const sourceExePath = path.join(releaseDir, artifactName);
if (!existsSync(sourceExePath)) throw new Error(`No se ha encontrado el portable generado: ${sourceExePath}`);

const [major, minor] = String(pkg.version).split('.');
const networkFileName = `Traccion ${major}.${minor}.piz`;
const networkFilePath = path.join(releaseDir, networkFileName);
copyFileSync(sourceExePath, networkFilePath);
const sha256 = createHash('sha256').update(readFileSync(networkFilePath)).digest('hex');
const manifest = { version: pkg.version, file: networkFileName, sha256, mandatory: false, notes: '' };
writeFileSync(path.join(releaseDir, 'version.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Paquete de actualización generado: ${networkFilePath}`);
console.log(`Manifiesto: version=${pkg.version}, file=${networkFileName}`);
console.log(`SHA-256: ${sha256}`);
