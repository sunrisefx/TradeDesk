"use client";

// ════════════════════════════════════════════════════════════════════════════
// Camera capture pipeline, tuned for cards behind sleeves / top-loaders:
//  1. Burst-capture a few frames and keep the sharpest (Laplacian variance) —
//     hand shake and autofocus hunting on glossy plastic are the #1 failure.
//  2. Crop to the on-screen card guide (+ margin) so the model sees one card.
//  3. Downscale to ~1400px long edge JPEG: plenty for 6pt Japanese text,
//     keeps uploads ~300KB on convention-hall 4G.
// ════════════════════════════════════════════════════════════════════════════

export const CARD_ASPECT = 63 / 88; // standard Pokémon card, width / height
const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.88;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Map the guide element's on-screen rect to source-video pixel coordinates,
 * accounting for `object-fit: cover` scaling/cropping of the <video>.
 */
export function guideToVideoRect(video: HTMLVideoElement, guide: HTMLElement, marginPct = 0.07): CropRect {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const vr = video.getBoundingClientRect();
  const gr = guide.getBoundingClientRect();
  const scale = Math.max(vr.width / vw, vr.height / vh);
  const offX = (vr.width - vw * scale) / 2;
  const offY = (vr.height - vh * scale) / 2;

  const mx = gr.width * marginPct;
  const my = gr.height * marginPct;
  let x = (gr.left - vr.left - offX - mx) / scale;
  let y = (gr.top - vr.top - offY - my) / scale;
  let w = (gr.width + 2 * mx) / scale;
  let h = (gr.height + 2 * my) / scale;
  x = Math.max(0, x);
  y = Math.max(0, y);
  w = Math.min(vw - x, w);
  h = Math.min(vh - y, h);
  return { x, y, w, h };
}

/** Variance of a 3×3 Laplacian over a small grayscale thumbnail — higher = sharper. */
function sharpness(source: CanvasImageSource, rect: CropRect): number {
  const W = 220;
  const H = Math.round((W * rect.h) / rect.w);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  const g = new Float32Array(W * H);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) g[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function cropToJpeg(source: CanvasImageSource, rect: CropRect): string {
  const scale = Math.min(1, MAX_EDGE / Math.max(rect.w, rect.h));
  const c = document.createElement("canvas");
  c.width = Math.round(rect.w * scale);
  c.height = Math.round(rect.h * scale);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", JPEG_QUALITY);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Grab `frames` frames ~90ms apart from the live video and return the sharpest crop
 * as a JPEG data URL (for preview) — strip the prefix before uploading.
 */
export async function captureBestFrame(video: HTMLVideoElement, guide: HTMLElement, frames = 4): Promise<{ dataUrl: string; score: number }> {
  const rect = guideToVideoRect(video, guide);
  let best: { canvas: HTMLCanvasElement; score: number } | null = null;
  for (let i = 0; i < frames; i++) {
    const snap = document.createElement("canvas");
    snap.width = video.videoWidth;
    snap.height = video.videoHeight;
    snap.getContext("2d")!.drawImage(video, 0, 0);
    const score = sharpness(snap, rect);
    if (!best || score > best.score) best = { canvas: snap, score };
    if (i < frames - 1) await wait(90);
  }
  return { dataUrl: cropToJpeg(best!.canvas, rect), score: best!.score };
}

/** For the file-picker fallback (or a photo from the camera roll). */
export async function fileToJpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  try {
    return cropToJpeg(bmp, { x: 0, y: 0, w: bmp.width, h: bmp.height });
  } finally {
    bmp.close();
  }
}

export function stripDataUrl(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, "");
}

/** Torch (flash) control — supported on some iOS versions/devices; feature-detected. */
export function supportsTorch(track: MediaStreamTrack | null | undefined): boolean {
  if (!track || typeof track.getCapabilities !== "function") return false;
  const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
  return Boolean(caps.torch);
}

export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  try {
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
}

/** Light haptic tick where supported (Android; iOS Safari ignores it gracefully). */
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* noop */
  }
}
