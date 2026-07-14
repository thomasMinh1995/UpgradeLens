import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { validateKnowledgeManifest } from './knowledge-manifest-builder.js';

/** Serialize a validated public manifest as stable UTF-8 pretty JSON. */
export function serializeKnowledgeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Atomically replace a manifest using write, flush, close, and rename. */
export async function writeKnowledgeManifest(outputPath, manifest) {
  validateKnowledgeManifest(manifest);
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  const contents = serializeKnowledgeManifest(manifest);
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
