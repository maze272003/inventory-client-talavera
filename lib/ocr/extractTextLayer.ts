import * as pdfjsLib from "pdfjs-dist";
import { OcrWord } from "./types";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
}

const MAX_PAGES = 5;

/**
 * Extract a PDF's embedded text layer as positioned words, when present.
 *
 * For digital / "reconstructed" PDFs this is exact — far more accurate than
 * rasterizing and running OCR. Returns `null` when the file is not a PDF or has
 * no usable text layer (a true scan/photo), so the caller can fall back to OCR.
 *
 * pdf.js text coordinates use a bottom-left origin (y grows upward); we convert
 * to a top-left origin (y grows downward) so the words match the OCR convention
 * that `parseInvoice` expects (header at the top → smallest y).
 */
export async function extractTextLayer(file: File): Promise<OcrWord[] | null> {
  if (file.type !== "application/pdf") return null;

  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = Math.min(doc.numPages, MAX_PAGES);

  const words: OcrWord[] = [];
  let yPageOffset = 0;
  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      // Text items expose `str`, `transform` ([a,b,c,d,e,f] → e=x, f=yBottom),
      // `width`, and `height`. Marked-content items have no `str`.
      const anyItem = item as {
        str?: string;
        transform?: number[];
        width?: number;
        height?: number;
      };
      const str = (anyItem.str ?? "").trim();
      if (str === "" || !anyItem.transform) continue;
      const x = anyItem.transform[4];
      const yBottom = anyItem.transform[5];
      const w = anyItem.width ?? str.length;
      const h = anyItem.height ?? 10;
      const y0 = viewport.height - (yBottom + h) + yPageOffset;
      words.push({ text: str, bbox: { x0: x, y0, x1: x + w, y1: y0 + h } });
    }
    // Offset following pages downward so rows from different pages don't merge.
    yPageOffset += viewport.height + 50;
  }

  // A handful of text runs is the threshold for "has a real text layer".
  return words.length >= 3 ? words : null;
}
