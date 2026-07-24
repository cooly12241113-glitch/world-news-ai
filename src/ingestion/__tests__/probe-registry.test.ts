import { describe, expect, it } from "vitest";
import type {
  ContentProbe,
  IngestionCapability,
  ResolvedInput,
} from "../index";
import {
  CapabilityRegistry,
  IngestionError,
  probeContent,
} from "../index";

const resolved = (content: string, mediaType?: string): ResolvedInput => ({
  originalInput: { kind: "content", content, mediaType },
  content,
  mediaType,
  charset: "utf-8",
  byteLength: new TextEncoder().encode(content).byteLength,
  retrievedAt: "2026-07-24T00:00:00.000Z",
  warnings: [],
});

describe("ContentProbe", () => {
  it("detects HTML from structure without a header", () => {
    expect(probeContent(resolved("<!doctype html><html></html>")).detectedFormat)
      .toBe("html");
  });

  it("prefers HTML structure over a text/plain declaration", () => {
    const result = probeContent(
      resolved("<html><body>content</body></html>", "text/plain"),
    );
    expect(result.detectedFormat).toBe("html");
    expect(result.structuralSignals).toContain("declared-content-type-mismatch");
  });

  it.each([
    ['{"value":1}', "json"],
    ['<?xml version="1.0"?><root/>', "xml"],
    ["<rss><channel/></rss>", "rss"],
    ['<feed xmlns="http://www.w3.org/2005/Atom"></feed>', "atom"],
    ["Ordinary plain text", "plain-text"],
  ])("detects %s as %s", (content, expected) => {
    expect(probeContent(resolved(content)).detectedFormat).toBe(expected);
  });

  it("detects binary-like content as unknown", () => {
    expect(probeContent(resolved("\u0000\u0001binary")).detectedFormat).toBe(
      "unknown",
    );
  });
});

const probe: ContentProbe = {
  detectedFormat: "plain-text",
  formatConfidence: 1,
  structuralSignals: [],
  isTextual: true,
  handlerCandidates: [],
};

const capability = (
  id: string,
  score: number,
  priority: number,
): IngestionCapability => ({
  id,
  priority,
  canHandle: () => ({ supported: score > 0, score, reasons: [`score:${score}`] }),
  extract: () => ({
    titleCandidates: [],
    bodyCandidates: [],
    dateCandidates: [],
    canonicalUrlCandidates: [],
    languageCandidates: [],
    authorCandidates: [],
    publisherCandidates: [],
    documentTypeCandidates: [],
    extractionWarnings: [],
    extractionTrace: [],
  }),
});

describe("CapabilityRegistry", () => {
  it("registers and selects by score", () => {
    const registry = new CapabilityRegistry();
    registry.register(capability("low", 50, 100));
    registry.register(capability("high", 90, 1));
    expect(registry.select(resolved("text"), probe).capability.id).toBe("high");
  });

  it("uses priority and then stable id as deterministic tie-breakers", () => {
    const priorityRegistry = new CapabilityRegistry();
    priorityRegistry.register(capability("low-priority", 80, 1));
    priorityRegistry.register(capability("high-priority", 80, 2));
    expect(priorityRegistry.select(resolved("text"), probe).capability.id).toBe(
      "high-priority",
    );

    const idRegistry = new CapabilityRegistry();
    idRegistry.register(capability("zeta", 80, 2));
    idRegistry.register(capability("alpha", 80, 2));
    expect(idRegistry.select(resolved("text"), probe).capability.id).toBe(
      "alpha",
    );
  });

  it("rejects duplicate IDs and reports no match", () => {
    const registry = new CapabilityRegistry();
    registry.register(capability("only", 0, 1));
    expect(() => registry.register(capability("only", 1, 1))).toThrow(
      IngestionError,
    );
    expect(() => registry.select(resolved("text"), probe)).toThrow(
      IngestionError,
    );
  });

  it("selects independently of hostname", () => {
    const registry = new CapabilityRegistry();
    registry.register(capability("structure-handler", 80, 1));
    const first = resolved("text");
    const second = resolved("text");
    first.finalUrl = "https://first.example/document";
    second.finalUrl = "https://second.example/document";
    expect(registry.select(first, probe).capability.id).toBe(
      registry.select(second, probe).capability.id,
    );
  });
});
