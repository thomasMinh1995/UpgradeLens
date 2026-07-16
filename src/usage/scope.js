import { compareText } from '../portable.js';

function packageNameFromId(packageId) {
  const separator = packageId.indexOf(':');
  return separator === -1 ? packageId : packageId.slice(separator + 1);
}

export function createUsageDiscoveryScope(projectManifest, versionAnalysisManifest) {
  const projects = new Map(projectManifest.projects.map((project) => [project.id, project]));
  const scoped = new Map();

  for (const result of versionAnalysisManifest.results) {
    const project = projects.get(result.dependency.projectId);
    if (!project) {
      throw new Error(`Usage Discovery input error: unknown project ${result.dependency.projectId}.`);
    }
    if (project.ecosystem !== result.dependency.ecosystem) {
      throw new Error(`Usage Discovery input error: ecosystem mismatch for ${project.id}.`);
    }
    const declared = project.dependencies.find((dependency) => (
      dependency.normalizedName === result.dependency.normalizedName
      && dependency.type === result.dependency.dependencyType
      && dependency.manifest === result.dependency.manifest
    ));
    if (!declared) {
      throw new Error(
        `Usage Discovery input error: ${result.dependency.packageId} is not declared by ${project.id}.`
      );
    }
    const key = `${project.id}\0${result.dependency.packageId}`;
    scoped.set(key, {
      projectId: project.id,
      projectPath: project.path,
      ecosystem: project.ecosystem,
      packageId: result.dependency.packageId,
      name: declared.name || packageNameFromId(result.dependency.packageId),
      normalizedName: declared.normalizedName
    });
  }

  return [...scoped.values()].sort((left, right) => (
    compareText(left.projectId, right.projectId) || compareText(left.packageId, right.packageId)
  ));
}
