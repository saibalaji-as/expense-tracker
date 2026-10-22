import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Hands a generated file to the user and reports truthfully where it went.
 *
 * Android app (Capacitor): the WebView silently ignores `<a download>` on blob/data
 * URLs, so the old browser path reported success while writing nothing. There we use
 * the native FileExport plugin (FileExportPlugin.java): save into Downloads/Spenza,
 * or — on Android 7–9 / if that fails — open the system share sheet.
 *
 * Browser: share sheet on touch devices that can share files, else a normal download.
 *
 * Throws when nothing could deliver the file, so callers never show a false success.
 */

export type FileDelivery =
  | { method: 'saved'; fileName: string; folder: string }
  | { method: 'shared'; fileName: string }
  | { method: 'downloaded'; fileName: string };

interface FileExportPlugin {
  saveToDownloads(options: NativeFileOptions): Promise<{ uri: string; fileName: string; folder: string }>;
  share(options: NativeFileOptions): Promise<{ fileName: string }>;
}

interface NativeFileOptions {
  fileName: string;
  content: string;
  mimeType: string;
  encoding: 'utf8' | 'base64';
}

const FileExport = registerPlugin<FileExportPlugin>('FileExport');

function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

async function deliverNative(options: NativeFileOptions): Promise<FileDelivery> {
  try {
    const saved = await FileExport.saveToDownloads(options);
    return { method: 'saved', fileName: saved.fileName, folder: saved.folder };
  } catch (saveError) {
    console.warn('[FileExport] saveToDownloads failed, falling back to share sheet:', saveError);
  }
  const shared = await FileExport.share(options);
  return { method: 'shared', fileName: shared.fileName };
}

async function deliverBrowser(fileName: string, blob: Blob, mimeType: string): Promise<FileDelivery> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (coarsePointer && typeof File === 'function' && nav.canShare && nav.share) {
    const file = new File([blob], fileName, { type: mimeType });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: fileName });
        return { method: 'shared', fileName };
      } catch (error) {
        // The user closed the share sheet: nothing else to do.
        if (error instanceof DOMException && error.name === 'AbortError') return { method: 'shared', fileName };
        // Otherwise fall through to a plain download.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { method: 'downloaded', fileName };
}

/** Text files (CSV, JSON). */
export async function deliverTextFile(fileName: string, content: string, mimeType: string): Promise<FileDelivery> {
  if (isNativeApp()) {
    return deliverNative({ fileName, content, mimeType, encoding: 'utf8' });
  }
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  return deliverBrowser(fileName, blob, mimeType);
}

/** Binary files given as a `data:<mime>;base64,...` URL (e.g. bill images). */
export async function deliverDataUrlFile(fileName: string, dataUrl: string): Promise<FileDelivery> {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Unsupported data URL');
  const [, mimeType, isBase64, payload] = match;
  if (!isBase64) throw new Error('Only base64 data URLs are supported');
  const base64 = payload;
  if (isNativeApp()) {
    return deliverNative({ fileName, content: base64, mimeType, encoding: 'base64' });
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return deliverBrowser(fileName, new Blob([bytes], { type: mimeType }), mimeType);
}

/** One-line, user-facing description of where the file went. */
export function deliveryDetail(delivery: FileDelivery, t: (key: string, params?: Record<string, string | number>) => string): string {
  switch (delivery.method) {
    case 'saved':
      return t('export.savedTo', { file: delivery.fileName, folder: delivery.folder });
    case 'shared':
      return t('export.shared', { file: delivery.fileName });
    default:
      return t('export.downloaded', { file: delivery.fileName });
  }
}
