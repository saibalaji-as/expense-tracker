/**
 * Client-side bill/receipt compression for Circle Splits shared previews.
 *
 * Receipts are text: a ~1000px long-edge WebP stays readable at a fraction of
 * the original size. Output is a base64 data URL destined for a Firestore doc,
 * so the byte budget must stay comfortably under the 1 MiB document limit —
 * quality steps down until the TARGET is met; anything still above the HARD
 * cap is rejected (better a clear error than a failed Firestore write).
 */

export interface CompressedBillImage {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  /** Approximate decoded byte size of the data URL payload. */
  bytes: number;
}

export const BILL_MAX_EDGE_PX = 1000;
export const BILL_TARGET_BYTES = 200_000;
export const BILL_HARD_CAP_BYTES = 700_000;

/** Thrown when even the lowest quality step exceeds BILL_HARD_CAP_BYTES. */
export class BillImageTooLargeError extends Error {
  constructor() {
    super('Bill image exceeds the size cap after compression');
    this.name = 'BillImageTooLargeError';
  }
}

const dataUrlBytes = (dataUrl: string): number => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor(base64.length * 0.75);
};

/**
 * Materializes a compressed preview back into a File — used by the Daily
 * receipt flow, whose Drive upload API takes File objects.
 */
export function compressedBillToFile(image: CompressedBillImage, baseName: string): File {
  const base64 = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = image.mimeType === 'image/webp' ? 'webp' : 'jpg';
  return new File([bytes], `${baseName}-compressed.${ext}`, {
    type: image.mimeType,
    lastModified: Date.now(),
  });
}

async function fileToImageSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to the <img> path (some formats/browsers)
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    img.src = url;
  });
}

/**
 * Compress an image file to a shared-preview data URL. Prefers WebP; falls
 * back to JPEG when the browser's canvas encoder ignores WebP (older Safari
 * silently returns PNG — detected via the data URL prefix).
 */
export async function compressBillImage(
  file: File,
  maxEdge = BILL_MAX_EDGE_PX,
  targetBytes = BILL_TARGET_BYTES,
  hardCapBytes = BILL_HARD_CAP_BYTES,
): Promise<CompressedBillImage> {
  const source = await fileToImageSource(file);
  const srcWidth = source.width;
  const srcHeight = source.height;
  const scale = Math.min(1, maxEdge / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.fillStyle = '#ffffff'; // receipts scanned as PNG may have alpha
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  if ('close' in source && typeof source.close === 'function') source.close();

  const encode = (mime: string, quality: number): string | null => {
    const url = canvas.toDataURL(mime, quality);
    return url.startsWith(`data:${mime}`) ? url : null;
  };
  const mimeType = encode('image/webp', 0.8) ? 'image/webp' : 'image/jpeg';

  let best: string | null = null;
  for (const quality of [0.8, 0.65, 0.5, 0.4]) {
    const url = encode(mimeType, quality);
    if (!url) continue;
    best = url;
    if (dataUrlBytes(url) <= targetBytes) break;
  }
  if (!best) throw new Error('Image encoding failed');
  const bytes = dataUrlBytes(best);
  if (bytes > hardCapBytes) throw new BillImageTooLargeError();

  return { dataUrl: best, mimeType, width, height, bytes };
}
