import * as pdfjsLib from "pdfjs-dist";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
}

const MAX_PAGES = 5;
const SCALE = 2;

export async function renderToImages(file: File): Promise<HTMLCanvasElement[]> {
  if (file.type === "application/pdf") {
    const data = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pageCount = Math.min(doc.numPages, MAX_PAGES);
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      canvases.push(canvas);
    }
    return canvases;
  }
  // Image file: draw onto a canvas.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return [canvas];
  } finally {
    URL.revokeObjectURL(url);
  }
}
