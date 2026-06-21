// Grayscale + simple threshold to improve OCR on photos.
export function preprocess(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = gray > 160 ? 255 : gray < 90 ? 0 : gray; // soft threshold
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
