import { renderToImages } from "./renderToImages";
import { preprocess } from "./preprocess";
import { runOcr } from "./runOcr";
import { extractTextLayer } from "./extractTextLayer";
import { parseInvoice } from "./parseInvoice";
import { OcrWord, ParsedInvoice } from "./types";

export async function extractInvoice(
  file: File,
  onProgress: (p: { stage: string; fraction: number }) => void,
): Promise<ParsedInvoice> {
  // Prefer the PDF's embedded text layer — exact, no OCR error. Only digital /
  // "reconstructed" PDFs have one; true scans/photos return null here and fall
  // through to the OCR pipeline below.
  onProgress({ stage: "Reading embedded text", fraction: 0 });
  const textWords = await extractTextLayer(file);
  if (textWords) {
    onProgress({ stage: "Parsing", fraction: 1 });
    return parseInvoice(textWords);
  }

  onProgress({ stage: "Rendering document", fraction: 0 });
  const canvases = await renderToImages(file);
  const allWords: OcrWord[] = [];
  for (let i = 0; i < canvases.length; i++) {
    onProgress({
      stage: `Reading page ${i + 1} of ${canvases.length}`,
      fraction: 0,
    });
    const pageHeight = canvases[i].height;
    const pre = preprocess(canvases[i]);
    const { words } = await runOcr(pre, (f) =>
      onProgress({
        stage: `Reading page ${i + 1} of ${canvases.length}`,
        fraction: f,
      }),
    );
    // Offset y by page so multi-page rows don't collide (page height + gap).
    const yOffset = i * (pageHeight + 50);
    for (const w of words) {
      allWords.push({
        ...w,
        bbox: { ...w.bbox, y0: w.bbox.y0 + yOffset, y1: w.bbox.y1 + yOffset },
      });
    }
  }
  onProgress({ stage: "Parsing", fraction: 1 });
  return parseInvoice(allWords);
}
