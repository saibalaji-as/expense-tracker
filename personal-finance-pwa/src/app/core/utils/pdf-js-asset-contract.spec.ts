// pdf.js runs its engine in a worker file that the Angular builder does NOT
// bundle. The app only works when (1) angular.json copies that worker into the
// build output and (2) the path the code asks for is exactly where it lands,
// and (3) the API and the worker come from the same pdf.js build. Getting any
// of these wrong breaks every PDF feature only in the BUILT app — so pin them.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PDF_WORKER_ASSET_PATH } from './pdf-js';

const ROOT = process.cwd(); // vitest runs from personal-finance-pwa/
const read = (relPath: string): string => readFileSync(join(ROOT, relPath), 'utf8');

interface AssetEntry { glob: string; input: string; output?: string }

describe('pdf.js worker asset contract', () => {
  const angular = JSON.parse(read('angular.json')) as {
    projects: Record<string, { architect: { build: { options: { assets: Array<string | AssetEntry> } } } }>;
  };
  const assets = Object.values(angular.projects)[0].architect.build.options.assets;
  const workerAsset = assets.find(
    (asset): asset is AssetEntry => typeof asset !== 'string' && asset.glob === 'pdf.worker.mjs'
  );
  const loader = read('src/app/core/utils/pdf-js.ts');

  it('angular.json copies the pdf.js worker into the build', () => {
    expect(workerAsset).toBeDefined();
    expect(existsSync(join(ROOT, workerAsset!.input, workerAsset!.glob))).toBe(true);
  });

  it('the code asks for the worker exactly where the build puts it', () => {
    expect(`${workerAsset!.output}/${workerAsset!.glob}`).toBe(PDF_WORKER_ASSET_PATH);
  });

  it('the API and the worker come from the same (legacy) pdf.js build', () => {
    expect(workerAsset!.input).toBe('node_modules/pdfjs-dist/legacy/build');
    expect(loader).toContain("import('pdfjs-dist/legacy/build/pdf.mjs')");
  });

  it('no service loads pdf.js on its own', () => {
    for (const file of ['src/app/core/services/receipt-extraction.service.ts', 'src/app/core/services/card-statement-pdf.service.ts']) {
      const source = read(file);
      // (`typeof import('pdfjs-dist')` as a TYPE is fine — a runtime import is not.)
      expect(/await\s+import\('pdfjs-dist/.test(source)).toBe(false);
      expect(source).not.toContain('pdf.worker');
      expect(source).toContain('loadPdfJs');
    }
  });
});
