import { renderToImages } from "./renderToImages";
import { preprocess } from "./preprocess";
import { runOcr } from "./runOcr";
import { parseInvoice } from "./parseInvoice";
import { OcrWord, ParsedInvoice } from "./types";

export async function extractInvoice(
  file: File,
  onProgress: (p: { stage: string; fraction: number }) => void,
): Promise<ParsedInvoice> {
  onProgress({ stage: "Rendering document", fraction: 0 });
  const canvases = await renderToImages(file);
  const allWords: OcrWord[] = [];
  for (let i = 0; i < canvases.length; i++) {
    onProgress({
      stage: `Reading page ${i + 1} of ${canvases.length}`,
      fraction: 0,
    });
    const pre = preprocess(canvases[i]);
    const { words } = await runOcr(pre, (f) =>
      onProgress({
        stage: `Reading page ${i + 1} of ${canvases.length}`,
        fraction: f,
      }),
    );
    // Offset y by page so multi-page rows don't collide (page height + gap).
    const yOffset = i * (canvases[i].height + 50);
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
