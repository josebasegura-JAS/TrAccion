export function parseTechnicalVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? '').trim());
  if (!match) {
    throw new Error(`Versión técnica no válida: "${version}". Debe tener formato MAJOR.MINOR.PATCH.`);
  }
  return { major: match[1], minor: match[2], patch: match[3] };
}

export function getReleaseLine(version) {
  const { major, minor } = parseTechnicalVersion(version);
  return `${major}.${minor}`;
}

export function getPortableArtifactName(version) {
  return `Traccion ${getReleaseLine(version)}.exe`;
}

export function getUpdatePackageName(version) {
  return `Traccion ${getReleaseLine(version)}.piz`;
}
