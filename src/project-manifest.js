import { compareText, isPortableRelativePath } from './portable.js';

const NODE_DEPENDENCY_TYPES = {
  dependency: 'dependencies',
  devDependency: 'devDependencies',
  optionalDependency: 'optionalDependencies',
  peerDependency: 'peerDependencies'
};

function addMismatch(errors, field, actual, expected) {
  if (actual !== expected) errors.push(`${field} is ${actual}; expected ${expected}.`);
}

/**
 * Validate relationships in a Project Manifest that JSON Schema cannot compare.
 * Input ordering is intentionally not required here because research planning
 * canonicalizes its own output independently of manifest array order.
 */
export function validateProjectManifestInvariants(manifest) {
  const errors = [];
  const projects = manifest.projects ?? [];
  const ecosystems = {};
  const projectIds = new Set();

  for (const project of projects) {
    if (projectIds.has(project.id)) errors.push(`Duplicate project id ${project.id}.`);
    projectIds.add(project.id);
    ecosystems[project.ecosystem] = (ecosystems[project.ecosystem] ?? 0) + 1;
    if (!isPortableRelativePath(project.path)) {
      errors.push(`Project ${project.id} has a non-portable path.`);
    }
    for (const manifestPath of project.manifests) {
      if (!isPortableRelativePath(manifestPath)) {
        errors.push(`Project ${project.id} has a non-portable manifest path.`);
      }
    }
    if (project.workspace && !isPortableRelativePath(project.workspace.root)) {
      errors.push(`Project ${project.id} has a non-portable workspace root.`);
    }

    const dependencies = project.dependencies;
    for (const dependency of dependencies) {
      if (!isPortableRelativePath(dependency.manifest)) {
        errors.push(`Project ${project.id} has a dependency with a non-portable manifest path.`);
      }
      const baselineFields = [
        'installedVersion',
        'installedVersionStatus',
        'installedVersionSource',
        'installedVersionReason'
      ];
      const baselineFieldCount = baselineFields.filter((field) => field in dependency).length;
      if (baselineFieldCount !== 0 && baselineFieldCount !== baselineFields.length) {
        errors.push(`Project ${project.id} dependency ${dependency.name} has an incomplete installed-version baseline.`);
      }
      if (baselineFieldCount === baselineFields.length) {
        if (dependency.installedVersionStatus === 'resolved') {
          if (
            typeof dependency.installedVersion !== 'string'
            || dependency.installedVersionSource === null
            || dependency.installedVersionReason !== null
          ) {
            errors.push(`Project ${project.id} dependency ${dependency.name} has inconsistent resolved baseline fields.`);
          }
        } else if (
          dependency.installedVersionStatus === 'unresolved'
          && (
            dependency.installedVersion !== null
            || dependency.installedVersionSource !== null
            || dependency.installedVersionReason === null
          )
        ) {
          errors.push(`Project ${project.id} dependency ${dependency.name} has inconsistent unresolved baseline fields.`);
        }
        if (
          dependency.installedVersionSource
          && (
            !isPortableRelativePath(dependency.installedVersionSource.path)
            || !isPortableRelativePath(dependency.installedVersionSource.packagePath)
          )
        ) {
          errors.push(`Project ${project.id} dependency ${dependency.name} has non-portable installed-version provenance.`);
        }
      }
    }

    if (project.dependencySummary.status !== 'parsed') {
      if (dependencies.length !== 0) {
        errors.push(`Project ${project.id} has dependencies with a non-parsed dependency summary.`);
      }
      continue;
    }

    const summary = project.dependencySummary;
    const uniqueCount = new Set(dependencies.map((dependency) => dependency.normalizedName)).size;
    addMismatch(errors, `${project.id}.dependencySummary.declarationCount`, summary.declarationCount, dependencies.length);
    addMismatch(errors, `${project.id}.dependencySummary.uniqueCount`, summary.uniqueCount, uniqueCount);
    addMismatch(
      errors,
      `${project.id}.dependencySummary.duplicateCount`,
      summary.duplicateCount,
      dependencies.length - uniqueCount
    );

    if (summary.byType) {
      const byType = {
        dependencies: 0,
        devDependencies: 0,
        peerDependencies: 0,
        optionalDependencies: 0
      };
      for (const dependency of dependencies) {
        const key = NODE_DEPENDENCY_TYPES[dependency.type];
        if (key) byType[key] += 1;
      }
      for (const [type, count] of Object.entries(byType)) {
        addMismatch(errors, `${project.id}.dependencySummary.byType.${type}`, summary.byType[type], count);
      }
    }
  }

  addMismatch(errors, 'summary.projectCount', manifest.summary.projectCount, projects.length);
  addMismatch(
    errors,
    'summary.workspaceCount',
    manifest.summary.workspaceCount,
    projects.filter((project) => project.workspace?.role === 'root').length
  );

  const actualEcosystemKeys = Object.keys(ecosystems).sort(compareText);
  const summaryEcosystemKeys = Object.keys(manifest.summary.ecosystems ?? []).sort(compareText);
  if (actualEcosystemKeys.join('\0') !== summaryEcosystemKeys.join('\0')) {
    errors.push('summary.ecosystems does not match project ecosystems.');
  } else {
    for (const ecosystem of actualEcosystemKeys) {
      addMismatch(errors, `summary.ecosystems.${ecosystem}`, manifest.summary.ecosystems[ecosystem], ecosystems[ecosystem]);
    }
  }

  return errors.sort(compareText);
}
