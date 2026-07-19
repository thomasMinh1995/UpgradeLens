import path from 'node:path';

function normalizeExtension(extension) {
  if (typeof extension !== 'string' || !/^\.[a-z0-9]+$/i.test(extension)) {
    throw new Error(`Usage analyzer extension must start with a dot: ${extension}.`);
  }
  return extension.toLowerCase();
}

function validateAnalyzer(analyzer) {
  if (!analyzer || typeof analyzer !== 'object') throw new Error('Usage analyzer must be an object.');
  if (typeof analyzer.id !== 'string' || analyzer.id.length === 0) {
    throw new Error('Usage analyzer id must be a non-empty string.');
  }
  if (typeof analyzer.version !== 'string' || analyzer.version.length === 0) {
    throw new Error(`Usage analyzer ${analyzer.id} version must be a non-empty string.`);
  }
  if (!Array.isArray(analyzer.ecosystems) || analyzer.ecosystems.length === 0) {
    throw new Error(`Usage analyzer ${analyzer.id} must declare at least one ecosystem.`);
  }
  if (!Array.isArray(analyzer.extensions) || analyzer.extensions.length === 0) {
    throw new Error(`Usage analyzer ${analyzer.id} must declare at least one extension.`);
  }
  if (typeof analyzer.analyze !== 'function') {
    throw new Error(`Usage analyzer ${analyzer.id} must expose analyze().`);
  }
}

export function createUsageAnalyzerRegistry(analyzers = []) {
  const byId = new Map();
  const byCapability = new Map();

  for (const analyzer of analyzers) {
    validateAnalyzer(analyzer);
    if (byId.has(analyzer.id)) throw new Error(`Duplicate usage analyzer id: ${analyzer.id}.`);
    byId.set(analyzer.id, analyzer);

    for (const ecosystem of analyzer.ecosystems) {
      for (const declaredExtension of analyzer.extensions) {
        const extension = normalizeExtension(declaredExtension);
        const key = `${ecosystem}\0${extension}`;
        if (byCapability.has(key)) {
          throw new Error(
            `Usage analyzer capability conflict for ${ecosystem}/${extension}: `
            + `${byCapability.get(key).id} and ${analyzer.id}.`
          );
        }
        byCapability.set(key, analyzer);
      }
    }
  }

  return Object.freeze({
    analyzers: () => [...byId.values()],
    extensions: () => [...new Set([...byCapability.keys()].map((key) => key.split('\0')[1]))].sort(),
    forEcosystem(ecosystem) {
      return [...byId.values()].filter((analyzer) => analyzer.ecosystems.includes(ecosystem));
    },
    find(ecosystem, filePath) {
      return byCapability.get(`${ecosystem}\0${path.extname(filePath).toLowerCase()}`) ?? null;
    }
  });
}
