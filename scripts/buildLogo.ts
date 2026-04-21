import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SVG_PATH = resolve(__dirname, '../public/logo.svg');

interface Target {
  path: string;
  size: number;
}

const TARGETS: Target[] = [
  { path: '../public/logo.png', size: 1024 },
  { path: '../public/logo-512.png', size: 512 },
  { path: '../public/logo-192.png', size: 192 },
  { path: '../src/app/apple-icon.png', size: 180 },
];

function render(svg: string, size: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  });
  return resvg.render().asPng();
}

function main(): void {
  const svg = readFileSync(SVG_PATH, 'utf8');

  for (const target of TARGETS) {
    const outPath = resolve(__dirname, target.path);
    mkdirSync(dirname(outPath), { recursive: true });
    const png = render(svg, target.size);
    writeFileSync(outPath, png);
    console.log(`[logo] ${target.size}px → ${outPath}`);
  }
}

main();
