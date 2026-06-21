import { createWorker } from "tesseract.js";
import type { Block } from "tesseract.js";
import { OcrResult, OcrWord } from "./types";

export async function runOcr(
  canvas: HTMLCanvasElement,
  onProgress: (fraction: number) => void,
): Promise<OcrResult> {
  const worker = await createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/tesseract-core.wasm.js",
    langPath: "/tesseract",
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress(m.progress);
      }
    },
  });
  try {
    // tesseract.js v7 does not return a top-level `data.words` array; word
    // boxes live under blocks -> paragraphs -> lines -> words, and the `blocks`
    // output is OFF by default. Request it explicitly so we get word bboxes.
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const words: OcrWord[] = [];
    for (const block of (data.blocks ?? []) as Block[]) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          for (const wd of line.words ?? []) {
            words.push({
              text: wd.text,
              bbox: {
                x0: wd.bbox.x0,
                y0: wd.bbox.y0,
                x1: wd.bbox.x1,
                y1: wd.bbox.y1,
              },
            });
          }
        }
      }
    }
    return { text: data.text, words };
  } finally {
    await worker.terminate();
  }
}
