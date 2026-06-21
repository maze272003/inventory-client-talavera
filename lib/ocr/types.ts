export type OcrWord = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
export type OcrResult = { text: string; words: OcrWord[] };
export type ParsedLine = {
  quantity?: number;
  model?: string;
  item?: string;
  unitCost?: number;
};
export type ParsedInvoice = {
  supplierName?: string;
  referenceNumber?: string;
  lines: ParsedLine[];
};
