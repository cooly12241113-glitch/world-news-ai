import { describe, expect, it } from "vitest";
import { createSemanticFingerprint, createSha256Fingerprint } from "../fingerprint";

describe("portable semantic fingerprint", () => {
  it("matches the SHA-256 standard vector in every runtime", () => {
    expect(createSha256Fingerprint("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("canonicalizes object key order", () => {
    expect(createSemanticFingerprint({ b: 2, a: 1 }))
      .toBe(createSemanticFingerprint({ a: 1, b: 2 }));
  });

  it("canonicalizes semantically equivalent Unicode strings", () => {
    expect(createSemanticFingerprint({ text: "évidence" }))
      .toBe(createSemanticFingerprint({ text: "e\u0301vidence" }));
  });
});
