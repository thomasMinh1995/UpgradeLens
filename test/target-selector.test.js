import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TargetSelectorError,
  parseTargetSelector,
  resolveTargetSelectors,
  targetOccurrenceId,
  targetOccurrenceKey
} from '../src/index.js';

function input({
  projectId = 'node:.',
  ecosystem = 'node',
  packageId = 'npm:library-a',
  name = 'library-a',
  manifest = 'package.json',
  type = 'dependency',
  declaredVersion = '^1.0.0'
} = {}) {
  return {
    project: { id: projectId, ecosystem },
    dependency: { name, manifest, type, declaredVersion },
    packageRecord: { id: packageId }
  };
}

function ambiguousError(inputs, selector = 'package=npm:library-a,target=2.0.0') {
  try {
    resolveTargetSelectors(inputs, [selector]);
  } catch (error) {
    assert.ok(error instanceof TargetSelectorError);
    assert.equal(error.code, 'TARGET_SELECTOR_AMBIGUOUS');
    return error;
  }
  assert.fail('Expected target selector ambiguity.');
}

test('same-manifest duplicate candidates round-trip to one independent occurrence', () => {
  const first = input({ declaredVersion: '>=1.0,<2.0' });
  const second = input({
    declaredVersion: 'library-a[extra]>=2.0; python_version < "3.12"'
  });
  const inputs = [second, first];
  const error = ambiguousError(inputs);

  assert.equal(error.candidates.length, 2);
  assert.equal(new Set(error.candidates).size, 2);
  assert.match(error.message, /Choose one of the following exact selectors/);
  assert.match(error.message, /declared: >=1\.0,<2\.0/);
  assert.match(error.message, /declared: library-a\[extra\]>=2\.0/);

  const firstCandidate = parseTargetSelector(error.candidates[0]);
  const secondCandidate = parseTargetSelector(error.candidates[1]);
  const firstResolved = resolveTargetSelectors(inputs, [firstCandidate]);
  const secondResolved = resolveTargetSelectors(inputs, [secondCandidate]);

  assert.equal(firstResolved.size, 1);
  assert.equal(secondResolved.size, 1);
  assert.notEqual(firstCandidate.occurrenceId, secondCandidate.occurrenceId);
  assert.equal(firstResolved.has(targetOccurrenceKey(first)), true);
  assert.equal(firstResolved.has(targetOccurrenceKey(second)), false);
  assert.equal(secondResolved.has(targetOccurrenceKey(second)), true);
  assert.equal(secondResolved.has(targetOccurrenceKey(first)), false);
  assert.equal(firstResolved.get(targetOccurrenceKey(first)).target.policy, 'explicit');
  assert.equal(secondResolved.get(targetOccurrenceKey(second)).target.policy, 'explicit');
});

test('occurrence identifiers and candidate ordering are deterministic and portable', () => {
  const root = input({ declaredVersion: 'workspace:*' });
  const workspace = input({
    projectId: 'node:apps/web',
    manifest: 'apps/web/package.json',
    declaredVersion: 'git+https://example.com/owner/library-a.git'
  });
  const forward = ambiguousError([root, workspace]);
  const reverse = ambiguousError([workspace, root]);

  assert.deepEqual(reverse.candidates, forward.candidates);
  assert.equal(targetOccurrenceId(root), targetOccurrenceId(structuredClone(root)));
  assert.match(targetOccurrenceId(root), /^sha256:[a-f0-9]{64}$/);
  assert.equal(forward.candidates.some((candidate) => candidate.includes('/Users/')), false);
});

test('candidate guidance distinguishes normalized aliases with otherwise equal facts', () => {
  const first = input({
    ecosystem: 'python',
    packageId: 'pypi:my-library',
    name: 'My_Library',
    manifest: 'requirements.txt',
    type: 'runtime',
    declaredVersion: '==1.0'
  });
  const second = input({
    ecosystem: 'python',
    packageId: 'pypi:my-library',
    name: 'my-library',
    manifest: 'requirements.txt',
    type: 'runtime',
    declaredVersion: '==1.0'
  });
  const error = ambiguousError(
    [second, first],
    'package=pypi:my-library,target=2.0'
  );

  assert.equal(new Set(error.candidates).size, 2);
  assert.match(error.message, /declared name: My_Library/);
  assert.match(error.message, /declared name: my-library/);
});

test('candidate guidance redacts credential-bearing and local declaration references', () => {
  const credential = input({
    declaredVersion: 'git+https://user:password@example.com/owner/library-a.git?token=secret'
  });
  const local = input({ declaredVersion: 'file:../private/library-a' });
  const error = ambiguousError([credential, local]);

  assert.doesNotMatch(error.message, /user|password|token=secret|private\/library-a/);
  assert.match(error.message, /declared: <redacted-declaration>/);
  assert.match(error.message, /declared: <local-path-reference>/);
  assert.equal(error.candidates.some((candidate) => candidate.includes('password')), false);
});

test('stale and conflicting occurrence discriminators fail closed', () => {
  const selected = input();
  const occurrenceId = targetOccurrenceId(selected);
  const stale = `sha256:${'0'.repeat(64)}`;

  assert.throws(
    () => resolveTargetSelectors(
      [selected],
      [`package=npm:library-a,target=2.0.0,occurrence=${stale}`]
    ),
    (error) => error.code === 'TARGET_SELECTOR_NOT_FOUND'
      && /no provider call was made/.test(error.message)
  );

  for (const selector of [
    `package=npm:other,target=2.0.0,occurrence=${occurrenceId}`,
    `package=npm:library-a,target=2.0.0,project=node:other,occurrence=${occurrenceId}`,
    `package=npm:library-a,target=2.0.0,manifest=other/package.json,occurrence=${occurrenceId}`,
    `package=npm:library-a,target=2.0.0,type=devDependency,occurrence=${occurrenceId}`
  ]) {
    assert.throws(
      () => resolveTargetSelectors([selected], [selector]),
      (error) => error.code === 'TARGET_SELECTOR_CONFLICT'
        && /no provider call was made/.test(error.message),
      selector
    );
  }
});

test('invalid and duplicate discriminator fields are rejected by the public grammar', () => {
  assert.throws(
    () => parseTargetSelector('package=npm:library-a,target=2.0.0,occurrence=not-a-digest'),
    (error) => error.code === 'TARGET_SELECTOR_INVALID'
  );
  const occurrence = `sha256:${'1'.repeat(64)}`;
  assert.throws(
    () => parseTargetSelector(
      `package=npm:library-a,target=2.0.0,occurrence=${occurrence},occurrence=${occurrence}`
    ),
    (error) => error.code === 'TARGET_SELECTOR_INVALID'
  );
});

test('exact identity collisions are rejected independently of array order', () => {
  const first = input();
  const duplicate = structuredClone(first);
  for (const inputs of [[first, duplicate], [duplicate, first]]) {
    assert.throws(
      () => resolveTargetSelectors(inputs, []),
      (error) => error.code === 'TARGET_SELECTOR_CONFLICT'
        && /identity .* is duplicated/.test(error.message)
        && /no provider call was made/.test(error.message)
    );
  }
});

test('existing unique, project-qualified, scoped npm, and Python selectors remain compatible', () => {
  const root = input();
  const workspace = input({
    projectId: 'node:apps/web',
    manifest: 'apps/web/package.json'
  });
  const scoped = input({
    packageId: 'npm:@scope/package',
    name: '@scope/package',
    declaredVersion: 'workspace:*'
  });
  const python = input({
    projectId: 'python:.',
    ecosystem: 'python',
    packageId: 'pypi:my-library',
    name: 'My_Library',
    manifest: 'requirements.txt',
    type: 'runtime',
    declaredVersion: '>=1.0,<2.0'
  });

  const selections = resolveTargetSelectors(
    [python, workspace, scoped, root],
    [
      'package=npm:library-a,target=2.0.0,project=node:apps/web,manifest=apps/web/package.json,type=dependency',
      'package=npm:@scope/package,target=3.0.0',
      'package=pypi:my-library,target=3.0.0'
    ]
  );
  assert.equal(selections.size, 3);
  assert.equal(selections.has(targetOccurrenceKey(root)), false);
  assert.equal(selections.get(targetOccurrenceKey(workspace)).targetVersion, '2.0.0');
  assert.equal(selections.get(targetOccurrenceKey(scoped)).targetVersion, '3.0.0');
  assert.equal(selections.get(targetOccurrenceKey(python)).targetVersion, '3.0.0');
});

test('multiple exact targets are input-order independent and never fan out', () => {
  const first = input({ declaredVersion: '1.0.0' });
  const second = input({ declaredVersion: '1.5.0' });
  const firstSelector = `package=npm:library-a,target=2.0.0,occurrence=${targetOccurrenceId(first)}`;
  const secondSelector = `package=npm:library-a,target=3.0.0,occurrence=${targetOccurrenceId(second)}`;

  const forward = resolveTargetSelectors([first, second], [firstSelector, secondSelector]);
  const reverse = resolveTargetSelectors([second, first], [secondSelector, firstSelector]);
  assert.deepEqual([...reverse.entries()], [...forward.entries()]);
  assert.equal(forward.get(targetOccurrenceKey(first)).targetVersion, '2.0.0');
  assert.equal(forward.get(targetOccurrenceKey(second)).targetVersion, '3.0.0');

  assert.throws(
    () => resolveTargetSelectors([first, second], [firstSelector, firstSelector]),
    (error) => error.code === 'TARGET_SELECTOR_CONFLICT'
  );
});
