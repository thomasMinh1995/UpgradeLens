import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { compareText, isSorted } from './portable.js';

export const KNOWLEDGE_EVIDENCE_BUNDLE_SCHEMA_VERSION = '1.0.0';

const schema = JSON.parse(await readFile(
  new URL('../schemas/knowledge-evidence-bundle.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

const compareEvidence = (left, right) => compareText(left.id, right.id);
const compareWarnings = (left, right) => {
  const fields = ['packageId', 'sourceId', 'code', 'message'];
  for (const field of fields) {
    const result = compareText(left[field] ?? '', right[field] ?? '');
    if (result !== 0) return result;
  }
  return 0;
};

function digestText(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort(compareText);
}

function addMismatch(errors, field, actual, expected) {
  if (actual !== expected) errors.push(`${field} is ${actual}; expected ${expected}.`);
}

/**
 * Validate Knowledge Evidence Bundle relationships that JSON Schema cannot
 * express. Cross-artifact source/package checks happen in the VA-02 loader.
 */
export function validateKnowledgeEvidenceBundleInvariants(bundle) {
  const errors = [];
  const evidence = bundle.evidence ?? [];
  const warnings = bundle.warnings ?? [];

  if (!isSorted(evidence, compareEvidence)) errors.push('evidence must be sorted by id.');
  if (!isSorted(warnings, compareWarnings)) {
    errors.push('warnings must be sorted by packageId, sourceId, code, and message.');
  }

  for (const duplicate of duplicateValues(evidence.map((item) => item.id))) {
    errors.push(`Duplicate evidence id ${duplicate}.`);
  }

  const packageIds = new Set();
  const sourceIds = new Set();
  for (const item of evidence) {
    packageIds.add(item.packageId);
    sourceIds.add(item.sourceId);
    if (!isSorted(item.releaseVersions, compareText)) {
      errors.push(`Evidence ${item.id} releaseVersions must be sorted lexically.`);
    }
    const actualDigest = digestText(item.content);
    if (item.contentDigest !== actualDigest) {
      errors.push(`Evidence ${item.id} contentDigest is ${item.contentDigest}; expected ${actualDigest}.`);
    }
  }

  addMismatch(errors, 'summary.evidenceCount', bundle.summary?.evidenceCount, evidence.length);
  addMismatch(errors, 'summary.packageCount', bundle.summary?.packageCount, packageIds.size);
  addMismatch(errors, 'summary.sourceCount', bundle.summary?.sourceCount, sourceIds.size);
  addMismatch(errors, 'summary.warningCount', bundle.summary?.warningCount, warnings.length);

  return errors.sort(compareText);
}

export function validateKnowledgeEvidenceBundle(bundle) {
  if (bundle?.schemaVersion !== KNOWLEDGE_EVIDENCE_BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `Knowledge Evidence Bundle schema validation failed: unsupported schema version; expected ${KNOWLEDGE_EVIDENCE_BUNDLE_SCHEMA_VERSION}.`
    );
  }
  if (!validateSchema(bundle)) {
    throw new Error(`Knowledge Evidence Bundle schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  const invariantErrors = validateKnowledgeEvidenceBundleInvariants(bundle);
  if (invariantErrors.length > 0) {
    throw new Error(`Knowledge Evidence Bundle runtime invariants failed: ${invariantErrors.join(' ')}`);
  }
  return bundle;
}
