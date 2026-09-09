import { describe, expect, it } from "vitest";
import { detectFreeCareUnder19 } from "../../src/extract/free-care.js";

describe("detectFreeCareUnder19", () => {
  it("detects explicit free care for children and young people", () => {
    expect(detectFreeCareUnder19("Vi erbjuder fri tandvård för barn och unga.")).toEqual([
      { value: true, matchedText: "fri tandvård för barn och unga" },
    ]);
  });

  it("detects explicit exclusion", () => {
    expect(detectFreeCareUnder19("Vi erbjuder ingen fri tandvård, endast vuxentandvård.")).toEqual([
      { value: false, matchedText: "ingen fri tandvård" },
      { value: false, matchedText: "endast vuxentandvård" },
    ]);
  });

  it("does not infer free care from ordinary children's dentistry wording", () => {
    expect(detectFreeCareUnder19("Vi erbjuder barntandvård för hela familjen.")).toEqual([]);
  });
});