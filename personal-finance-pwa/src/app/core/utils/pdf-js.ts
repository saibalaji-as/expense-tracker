/**
 * The ONE way to load pdf.js in the app (receipt PDFs, bank statement PDFs).
 *
 * Two things went wrong when each service imported `pdfjs-dist` on its own
 * (found 2026-10-02, bank statement check failing in the built app):
 *
 * 1. The worker was referenced as
 *    `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)`. The Angular
 *    builder does not bundle or copy such a file, so the built app asked for a
 *    worker that was never shipped and every `getDocument()` failed with
 *    "Setting up fake worker failed". The worker is now copied by angular.json
 *    (`assets` → `pdfjs/pdf.worker.mjs`) and addressed by that stable path.
 *
 * 2. pdf.js's default build targets only the newest browsers (it calls e.g.
 *    `Math.sumPrecise`), which broke password-protected (AES-256) PDFs on
 *    browsers/WebViews without it. The `legacy` build ships its own polyfills,
 *    so both the API and the worker come from `pdfjs-dist/legacy/build`.
 *
 * The API and the worker MUST come from the same build — pinned by
 * pdf-js-asset-contract.spec.ts.
 */

/** Where angular.json copies the pdf.js worker, relative to the app's base URL. */
export const PDF_WORKER_ASSET_PATH = 'pdfjs/pdf.worker.mjs';

type PdfJs = typeof import('pdfjs-dist');

let pdfJs: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  pdfJs ??= import('pdfjs-dist/legacy/build/pdf.mjs')
    .then((lib) => {
      // document.baseURI, not import.meta.url: chunks may be served from
      // anywhere, the asset always sits under the app root (web and Capacitor).
      lib.GlobalWorkerOptions.workerSrc = new URL(PDF_WORKER_ASSET_PATH, document.baseURI).toString();
      return lib;
    })
    .catch((error) => {
      // A failed chunk download must not poison every later attempt.
      pdfJs = null;
      throw error;
    });
  return pdfJs;
}
