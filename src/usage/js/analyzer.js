import { parseJavaScriptSource } from './parser.js';

export const JAVASCRIPT_USAGE_ANALYZER_ID = 'javascript-typescript';
export const JAVASCRIPT_USAGE_ANALYZER_VERSION = '1.0.0';
export const JAVASCRIPT_SOURCE_EXTENSIONS = Object.freeze([
  '.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'
]);

const SKIPPED_KEYS = new Set(['loc', 'start', 'end', 'extra', 'errors', 'tokens', 'comments']);

function childEntries(node) {
  const entries = [];
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') entries.push([child, key]);
      }
    } else if (value && typeof value.type === 'string') entries.push([value, key]);
  }
  return entries;
}

function walk(node, visitor, parent = null, key = null, ancestors = []) {
  visitor(node, parent, key, ancestors);
  for (const [child, childKey] of childEntries(node)) {
    walk(child, visitor, node, childKey, [...ancestors, node]);
  }
}

function importedName(specifier) {
  if (specifier.type === 'ImportDefaultSpecifier') return 'default';
  if (specifier.type === 'ImportNamespaceSpecifier') return '*';
  return specifier.imported?.name ?? specifier.imported?.value;
}

function exportedName(specifier) {
  if (specifier.type === 'ExportNamespaceSpecifier') return '*';
  return specifier.local?.name ?? specifier.local?.value;
}

function moduleName(node) {
  return typeof node?.value === 'string' ? node.value : null;
}

export function npmPackageName(specifier) {
  if (typeof specifier !== 'string' || specifier.length === 0) return null;
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')
      || specifier.startsWith('node:') || /^[a-z][a-z+.-]*:/i.test(specifier)) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

function createDependencyMatcher(dependencies) {
  const candidates = [...dependencies]
    .filter((item) => typeof item.name === 'string' && item.name.length > 0)
    .sort((left, right) => right.name.length - left.name.length || left.name.localeCompare(right.name));
  return (specifier) => {
    const root = npmPackageName(specifier);
    if (!root) return null;
    return candidates.find((item) => root === item.name) ?? null;
  };
}

function patternNames(pattern, names = []) {
  if (!pattern) return names;
  if (pattern.type === 'Identifier') names.push(pattern.name);
  else if (pattern.type === 'RestElement') patternNames(pattern.argument, names);
  else if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, names);
  else if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      patternNames(property.type === 'RestElement' ? property.argument : property.value, names);
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements) patternNames(element, names);
  } else if (pattern.type === 'TSParameterProperty') patternNames(pattern.parameter, names);
  return names;
}

function nearestScope(ancestors, kind = 'lexical') {
  const candidates = [...ancestors].reverse();
  if (kind === 'var') {
    return candidates.find((node) => node.type === 'Program' || /^(Function)/.test(node.type));
  }
  return candidates.find((node) => (
    node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'CatchClause'
    || /^(Function)/.test(node.type)
  ));
}

function addShadow(shadows, names, scope) {
  if (!scope || typeof scope.start !== 'number' || typeof scope.end !== 'number') return;
  for (const name of names) {
    if (!shadows.has(name)) shadows.set(name, []);
    shadows.get(name).push([scope.start, scope.end]);
  }
}

function collectShadowRanges(program, importedBindings) {
  const shadows = new Map();
  walk(program, (node, parent, key, ancestors) => {
    if (node.type === 'VariableDeclaration') {
      const names = node.declarations.flatMap((declaration) => patternNames(declaration.id));
      addShadow(shadows, names.filter((name) => importedBindings.has(name)), nearestScope(ancestors, node.kind));
    } else if (/^Function/.test(node.type)) {
      const names = node.params.flatMap((parameter) => patternNames(parameter));
      addShadow(shadows, names.filter((name) => importedBindings.has(name)), node);
      if (node.type === 'FunctionDeclaration' && node.id && importedBindings.has(node.id.name)) {
        addShadow(shadows, [node.id.name], nearestScope(ancestors));
      } else if (node.type === 'FunctionExpression' && node.id && importedBindings.has(node.id.name)) {
        addShadow(shadows, [node.id.name], node.body);
      }
    } else if (node.type === 'ClassDeclaration' && node.id && importedBindings.has(node.id.name)) {
      addShadow(shadows, [node.id.name], nearestScope(ancestors));
    } else if (node.type === 'CatchClause') {
      const names = patternNames(node.param).filter((name) => importedBindings.has(name));
      addShadow(shadows, names, node.body);
    } else if (/^TS(?:Interface|TypeAlias|Enum|Module)Declaration$/.test(node.type)
        && node.id?.name && importedBindings.has(node.id.name)) {
      addShadow(shadows, [node.id.name], nearestScope(ancestors));
    }
  });
  return shadows;
}

function isShadowed(shadows, name, node) {
  return (shadows.get(name) ?? []).some(([start, end]) => node.start >= start && node.end <= end);
}

function isDeclarationIdentifier(node, parent, key) {
  if (!parent) return false;
  if (parent.type.startsWith('Import')) return true;
  if ((parent.type === 'VariableDeclarator' || parent.type === 'AssignmentPattern') && key === 'id') return true;
  if (/^(Function|Class)/.test(parent.type) && (key === 'id' || key === 'params')) return true;
  if ((parent.type === 'RestElement' || parent.type === 'TSParameterProperty') && key === 'argument') return true;
  if (parent.type === 'CatchClause' && key === 'param') return true;
  return false;
}

function isReferenceIdentifier(node, parent, key) {
  if (!parent || isDeclarationIdentifier(node, parent, key)) return false;
  if ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression')
      && key === 'property' && !parent.computed) return false;
  if (parent.type === 'JSXMemberExpression' && key === 'property') return false;
  if (parent.type === 'JSXAttribute' && key === 'name') return false;
  if ((parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod' || parent.type === 'ClassMethod'
      || parent.type === 'ClassProperty' || parent.type === 'ClassAccessorProperty')
      && key === 'key' && !parent.computed) return false;
  if (parent.type === 'ExportSpecifier' && key === 'exported') return false;
  if (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') {
    return false;
  }
  if (parent.type.startsWith('TS') && ['key', 'id'].includes(key)
      && !['TSTypeReference', 'TSExpressionWithTypeArguments', 'TSTypeQuery'].includes(parent.type)) return false;
  return true;
}

function namespaceMember(node, parent, key) {
  if ((parent?.type === 'MemberExpression' || parent?.type === 'OptionalMemberExpression')
      && key === 'object') {
    if (!parent.computed && parent.property.type === 'Identifier') return parent.property.name;
    if (parent.computed && parent.property.type === 'StringLiteral') return parent.property.value;
  }
  if (node.type === 'JSXIdentifier' && parent?.type === 'JSXMemberExpression' && key === 'object') {
    return parent.property.name;
  }
  return '*';
}

function addUsage(usages, dependency, symbol, file) {
  if (!dependency || (symbol !== null && (typeof symbol !== 'string' || symbol.length === 0))) return;
  usages.set(`${dependency.packageId}\0${symbol ?? '<dependency>'}`, {
    packageId: dependency.packageId,
    dependency: dependency.name,
    symbol,
    file
  });
}

export function analyzeJavaScriptUsage({ source, file, dependencies }) {
  const ast = parseJavaScriptSource(source, file);
  const matchDependency = createDependencyMatcher(dependencies);
  const bindings = new Map();
  const usages = new Map();

  for (const statement of ast.program.body) {
    if (statement.type === 'ImportDeclaration') {
      const dependency = matchDependency(moduleName(statement.source));
      if (!dependency) continue;
      if (statement.specifiers.length === 0) addUsage(usages, dependency, null, file);
      for (const specifier of statement.specifiers) {
        bindings.set(specifier.local.name, {
          dependency,
          symbol: importedName(specifier),
          namespace: specifier.type === 'ImportNamespaceSpecifier',
          declaration: specifier.local
        });
      }
    } else if (statement.type === 'ExportNamedDeclaration' && statement.source) {
      const dependency = matchDependency(moduleName(statement.source));
      for (const specifier of statement.specifiers) {
        addUsage(usages, dependency, exportedName(specifier), file);
      }
    } else if (statement.type === 'ExportAllDeclaration') {
      addUsage(usages, matchDependency(moduleName(statement.source)), '*', file);
    }
  }

  const shadows = collectShadowRanges(ast.program, bindings);
  walk(ast.program, (node, parent, key) => {
    if (node.type === 'ImportExpression') {
      addUsage(usages, matchDependency(moduleName(node.source)), '*', file);
      return;
    }
    if (node.type !== 'Identifier' && node.type !== 'JSXIdentifier') return;
    const binding = bindings.get(node.name);
    if (!binding || node === binding.declaration || isShadowed(shadows, node.name, node)
        || !isReferenceIdentifier(node, parent, key)) return;
    addUsage(
      usages,
      binding.dependency,
      binding.namespace ? namespaceMember(node, parent, key) : binding.symbol,
      file
    );
  });

  return [...usages.values()].sort((left, right) => (
    left.packageId.localeCompare(right.packageId) || (left.symbol ?? '').localeCompare(right.symbol ?? '')
  ));
}

export function createJavaScriptUsageAnalyzer() {
  return Object.freeze({
    id: JAVASCRIPT_USAGE_ANALYZER_ID,
    version: JAVASCRIPT_USAGE_ANALYZER_VERSION,
    ecosystems: Object.freeze(['node']),
    extensions: JAVASCRIPT_SOURCE_EXTENSIONS,
    analyze: analyzeJavaScriptUsage
  });
}
