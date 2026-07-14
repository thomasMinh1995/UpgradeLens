import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { DEFAULT_MANIFEST_PATH, MANIFEST_SCHEMA_VERSION } from './constants.js';
import { isPortableRelativePath } from './portable.js';
import { validateProjectManifestInvariants } from './project-manifest.js';

const schema = JSON.parse(await readFile(
  new URL('../schemas/project-manifest.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function inputError(message) {
  return new Error(`Project Manifest input error: ${message}`);
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function parseManifest(bytes) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw inputError('manifest bytes are not valid JSON.');
  }
}

function artifactFor(source, options) {
  const artifact = typeof source === 'object' && source !== null && 'bytes' in source
    ? source.artifact
    : options.artifact ?? DEFAULT_MANIFEST_PATH;
  if (!isPortableRelativePath(artifact)) {
    throw inputError('artifact must be a portable repository-relative path.');
  }
  return artifact;
}

async function readInputBytes(source) {
  if (typeof source === 'string' || source instanceof URL) return readFile(source);
  if (source && typeof source === 'object' && 'bytes' in source) {
    if (!(source.bytes instanceof Uint8Array)) {
      throw inputError('bytes must be a Uint8Array or Buffer.');
    }
    return Buffer.from(source.bytes);
  }
  throw inputError('source must be a manifest file path or { bytes, artifact }.');
}

/**
 * Read one exact Project Manifest byte sequence, validate it, and return its
 * parsed value together with portable lineage for research planning.
 */
export async function loadProjectManifestInput(source, options = {}) {
  const artifact = artifactFor(source, options);
  const bytes = await readInputBytes(source);
  const manifest = parseManifest(bytes);

  if (manifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw inputError(`unsupported schema version; expected ${MANIFEST_SCHEMA_VERSION}.`);
  }
  if (!validateSchema(manifest)) {
    throw inputError(`schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  const invariantErrors = validateProjectManifestInvariants(manifest);
  if (invariantErrors.length > 0) {
    throw inputError(`runtime invariants failed: ${invariantErrors.join(' ')}`);
  }

  return {
    manifest,
    input: {
      projectManifest: {
        schemaVersion: manifest.schemaVersion,
        artifact,
        artifactDigest: digest(bytes),
        repository: {
          name: manifest.repository.name,
          root: manifest.repository.root
        }
      }
    }
  };
}
