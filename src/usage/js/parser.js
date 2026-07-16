import { parse } from '@babel/parser';

export function parseJavaScriptSource(source, filePath = '<source>') {
  return parse(source, {
    sourceFilename: filePath,
    sourceType: 'unambiguous',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    createImportExpressions: true,
    plugins: [
      'jsx',
      'typescript',
      'decoratorAutoAccessors',
      ['decorators', { decoratorsBeforeExport: true }],
      'explicitResourceManagement',
      'importAttributes'
    ]
  });
}

export const parseJavaScriptModule = parseJavaScriptSource;
