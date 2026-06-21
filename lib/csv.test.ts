import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("emits headers then rows in column order", () => {
    const csv = toCsv(
      [{ name: "Tire", qty: 5 }],
      [{ key: "name", header: "Name" }, { key: "qty", header: "Qty" }],
    );
    expect(csv).toBe("Name,Qty\r\nTire,5");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    const csv = toCsv(
      [{ a: 'he said "hi"', b: "x,y", c: "line1\nline2" }],
      [{ key: "a", header: "A" }, { key: "b", header: "B" }, { key: "c", header: "C" }],
    );
    expect(csv).toBe('A,B,C\r\n"he said ""hi""","x,y","line1\nline2"');
  });
});
