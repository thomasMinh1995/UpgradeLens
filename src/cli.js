import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CLI_NAME,
  DEFAULT_MANIFEST_PATH,
  PRODUCT_NAME,
  VERSION
} from './constants.js';
import { discoverProject } from './discovery.js';

const HELP = `${PRODUCT_NAME} ${VERSION}

Discover the projects and technology ecosystems in a repository.

Usage:
  ${CLI_NAME} discover [path] [options]
  ${CLI_NAME} [path] [options]

Options:
  -o, --output <path>   Manifest path relative to the project root
                        (default: ${DEFAULT_MANIFEST_PATH})
      --stdout          Print the manifest instead of writing a file
      --no-pretty       Emit compact JSON
      --max-depth <n>   Maximum directory depth to scan
      --fail-on-warning Return exit code 2 when discovery has warnings
  -h, --help            Show help
  -v, --version         Show version
`;

function takeValue(args, index, option) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) throw new Error(`${option} requires a value`);
  return value;
}

export function parseArguments(argv) {
  const args = [...argv];
  if (args[0] === 'discover') args.shift();
  const options = {
    root: '.',
    output: DEFAULT_MANIFEST_PATH,
    pretty: true,
    stdout: false,
    failOnWarning: false
  };
  let rootSet = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--version' || argument === '-v') options.version = true;
    else if (argument === '--stdout') options.stdout = true;
    else if (argument === '--no-pretty') options.pretty = false;
    else if (argument === '--fail-on-warning') options.failOnWarning = true;
    else if (argument === '--output' || argument === '-o') {
      options.output = takeValue(args, index, argument);
      index += 1;
    } else if (argument === '--max-depth') {
      const raw = takeValue(args, index, argument);
      const depth = Number(raw);
      if (!Number.isInteger(depth) || depth < 0) throw new Error('--max-depth must be a non-negative integer');
      options.maxDepth = depth;
      index += 1;
    } else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else if (!rootSet) {
      options.root = argument;
      rootSet = true;
    } else throw new Error(`Unexpected argument: ${argument}`);
  }
  return options;
}

async function writeManifest(root, output, contents) {
  const outputPath = path.resolve(root, output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, outputPath);
  return outputPath;
}

export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const options = parseArguments(argv);
    if (options.help) {
      stdout.write(HELP);
      return 0;
    }
    if (options.version) {
      stdout.write(`${VERSION}\n`);
      return 0;
    }

    const manifest = await discoverProject(options.root, { maxDepth: options.maxDepth });
    const indentation = options.pretty ? 2 : 0;
    const contents = `${JSON.stringify(manifest, null, indentation)}\n`;
    if (options.stdout) stdout.write(contents);
    else {
      const outputPath = await writeManifest(options.root, options.output, contents);
      stderr.write(`Discovered ${manifest.summary.projectCount} project(s).\n`);
      stderr.write(`Manifest: ${outputPath}\n`);
      if (manifest.warnings.length) stderr.write(`Warnings: ${manifest.warnings.length}\n`);
    }
    return options.failOnWarning && manifest.warnings.length > 0 ? 2 : 0;
  } catch (error) {
    stderr.write(`${CLI_NAME}: ${error.message}\n`);
    return 1;
  }
}

export { HELP };
