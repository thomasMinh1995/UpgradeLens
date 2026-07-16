import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { validateVersionAnalysisManifest } from './version-analysis-manifest.js';

export function serializeVersionAnalysisManifest(manifest) {
  validateVersionAnalysisManifest(manifest);
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function writeVersionAnalysisManifest(outputPath, manifest) {
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  const contents = serializeVersionAnalysisManifest(manifest);
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
