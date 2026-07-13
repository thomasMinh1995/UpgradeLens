function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortDependencies(dependencies) {
  return [...dependencies].sort((left, right) =>
    compare(left.normalizedName, right.normalizedName)
    || compare(left.type, right.type)
    || compare(left.name, right.name)
    || compare(left.declaredVersion ?? '', right.declaredVersion ?? '')
    || compare(left.manifest ?? '', right.manifest ?? '')
  );
}

export function summarizeDependencies(dependencies, byType) {
  const declarationCount = dependencies.length;
  const uniqueCount = new Set(dependencies.map((dependency) => dependency.normalizedName)).size;
  return {
    status: 'parsed',
    declarationCount,
    uniqueCount,
    duplicateCount: declarationCount - uniqueCount,
    ...(byType ? { byType } : {})
  };
}

export function duplicateDependencyNames(dependencies) {
  const counts = new Map();
  for (const dependency of dependencies) {
    counts.set(dependency.normalizedName, (counts.get(dependency.normalizedName) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort();
}

export function duplicateDependencyWarnings(dependencies, manifest) {
  return duplicateDependencyNames(dependencies).map((name) => ({
    code: 'DUPLICATE_DEPENDENCY_DECLARATION',
    path: manifest,
    message: `Dependency ${name} is declared multiple times.`
  }));
}
