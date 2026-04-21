import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MARK_SVG = resolve(__dirname, '../public/logo.svg');
const WORDMARK_SVG = resolve(__dirname, '../public/wordmark.svg');

interface Target {
  svg: string;
  path: string;
  size: number;
  fit: 'width' | 'height';
}

const TARGETS: Target[] = [
  { svg: MARK_SVG, path: '../public/logo.png', size: 1024, fit: 'width' },
  { svg: MARK_SVG, path: '../public/logo-512.png', size: 512, fit: 'width' },
  { svg: MARK_SVG, path: '../public/logo-192.png', size: 192, fit: 'width' },
  { svg: MARK_SVG, path: '../src/app/apple-icon.png', size: 180, fit: 'width' },
  { svg: WORDMARK_SVG, path: '../public/wordmark.png', size: 720, fit: 'width' },
  { svg: WORDMARK_SVG, path: '../public/wordmark-360.png', size: 360, fit: 'width' },
];

function render(svg: string, size: number, fit: 'width' | 'height'): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: fit, value: size },
    background: 'rgba(0,0,0,0)',
  });
  return resvg.render().asPng();
}

function main(): void {
  for (const target of TARGETS) {
    const svg = readFileSync(target.svg, 'utf8');
    const outPath = resolve(__dirname, target.path);
    mkdirSync(dirname(outPath), { recursive: true });
    const png = render(svg, target.size, target.fit);
    writeFileSync(outPath, png);
    console.log(`[logo] ${target.size}px → ${outPath}`);
  }
}

main();
