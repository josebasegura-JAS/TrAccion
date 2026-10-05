import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPortableArtifactName } from './release-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
const artifactName = getPortableArtifactName(pkg.version);
const electronBuilderCli = path.join(projectDir, 'node_modules', 'electron-builder', 'cli.js');

// Ejecutamos el CLI local con el mismo Node que está ejecutando este script.
// Evita spawnSync('npx.cmd', ...) que en Windows con Node 22 puede fallar con EINVAL.
const result = spawnSync(
  process.execPath,
  [
    electronBuilderCli,
    '--win',
    'portable',
    `--config.portable.artifactName=${artifactName}`,
  ],
  { cwd: projectDir, stdio: 'inherit' },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`Portable generado como: ${artifactName}`);
