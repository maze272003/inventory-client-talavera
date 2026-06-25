import { describe, expect, it } from "vitest";
import { toToastArgs } from "./toast";

describe("toToastArgs", () => {
  it("maps danger variant to the error method", () => {
    const r = toToastArgs({ title: "Boom", description: "bad", variant: "danger" });
    expect(r.method).toBe("error");
    expect(r.message).toBe("Boom");
    expect(r.data.description).toBe("bad");
  });

  it("maps success/info/warning variants to matching methods", () => {
    expect(toToastArgs({ title: "a", variant: "success" }).method).toBe("success");
    expect(toToastArgs({ title: "a", variant: "info" }).method).toBe("info");
    expect(toToastArgs({ title: "a", variant: "warning" }).method).toBe("warning");
  });

  it("defaults to info when no variant is given", () => {
    expect(toToastArgs({ title: "a" }).method).toBe("info");
  });

  it("translates duration 0 to Infinity (sticky) and passes other durations through", () => {
    expect(toToastArgs({ title: "a", duration: 0 }).data.duration).toBe(Infinity);
    expect(toToastArgs({ title: "a", duration: 6000 }).data.duration).toBe(6000);
  });

  it("falls back to an empty message when title is absent", () => {
    expect(toToastArgs({ description: "only desc" }).message).toBe("");
  });
});
