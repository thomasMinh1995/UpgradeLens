import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { validateRepositoryImpactEvidence } from './repository-impact-evidence.js';

export function serializeRepositoryImpactEvidence(evidence) {
  validateRepositoryImpactEvidence(evidence);
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

export async function writeRepositoryImpactEvidence(outputPath, evidence) {
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  const contents = serializeRepositoryImpactEvidence(evidence);
  await mkdir(path.dirname(target), { recursive: true });
  let handle;
  try {
    handle = await open(temporary, 'w', 0o600);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return target;
}
