import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const bundlePath = path.join(rootDir, 'index.html');
const sourcePath = path.join(rootDir, 'src', 'dashboard.template.html');
const templateMarker = '<script type="__bundler/template">';

function findTemplateBlock(bundle) {
  const markerStart = bundle.indexOf(templateMarker);
  if (markerStart === -1) {
    throw new Error(`Missing ${templateMarker} in index.html`);
  }

  const payloadStart = markerStart + templateMarker.length;
  const payloadEnd = bundle.indexOf('</script>', payloadStart);
  if (payloadEnd === -1) {
    throw new Error('Missing closing script tag for bundled template');
  }

  const block = bundle.slice(payloadStart, payloadEnd);
  const leadingWhitespace = block.match(/^\s*/)?.[0] ?? '';
  const trailingWhitespace = block.match(/\s*$/)?.[0] ?? '';

  return {
    payloadStart,
    payloadEnd,
    payload: block.trim(),
    leadingWhitespace,
    trailingWhitespace,
  };
}

function decodeTemplate(bundle) {
  const { payload } = findTemplateBlock(bundle);
  const source = JSON.parse(payload);
  if (typeof source !== 'string') {
    throw new Error('Bundled template payload is not a JSON string');
  }
  return source;
}

function encodeTemplate(source) {
  // Escaping closing tags prevents the browser from ending the carrier script
  // while it is still parsing the JSON string.
  return JSON.stringify(source).replace(/<\//g, '<\\/');
}

function rebuildBundle(bundle, source) {
  const block = findTemplateBlock(bundle);
  return [
    bundle.slice(0, block.payloadStart),
    block.leadingWhitespace,
    encodeTemplate(source),
    block.trailingWhitespace,
    bundle.slice(block.payloadEnd),
  ].join('');
}

async function extract() {
  const bundle = await readFile(bundlePath, 'utf8');
  const source = decodeTemplate(bundle);
  await writeFile(sourcePath, source, 'utf8');
  console.log(`Extracted ${source.length} characters to ${path.relative(rootDir, sourcePath)}`);
}

async function build() {
  const [bundle, source] = await Promise.all([
    readFile(bundlePath, 'utf8'),
    readFile(sourcePath, 'utf8'),
  ]);
  await writeFile(bundlePath, rebuildBundle(bundle, source), 'utf8');
  console.log(`Built ${path.relative(rootDir, bundlePath)} from ${path.relative(rootDir, sourcePath)}`);
}

async function check() {
  const [bundle, source] = await Promise.all([
    readFile(bundlePath, 'utf8'),
    readFile(sourcePath, 'utf8'),
  ]);
  const embeddedSource = decodeTemplate(bundle);

  if (embeddedSource !== source) {
    throw new Error('src/dashboard.template.html and index.html are out of sync; run npm run build');
  }

  if (rebuildBundle(bundle, source) !== bundle) {
    throw new Error('index.html is not a deterministic build of the dashboard source');
  }

  console.log('Dashboard source and generated index.html are in sync.');
}

const command = process.argv[2] ?? 'check';
const commands = { extract, build, check };

if (!commands[command]) {
  throw new Error(`Unknown command: ${command}. Use extract, build, or check.`);
}

await commands[command]();
