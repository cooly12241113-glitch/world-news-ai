import type { ContentProbe, DetectedFormat, ResolvedInput } from "./types";

const mediaTypeOnly = (value?: string): string | undefined =>
  value?.split(";", 1)[0]?.trim().toLowerCase();

const looksLikeHtml = (value: string): boolean =>
  /<!doctype\s+html|<html(?:\s|>)/i.test(value.slice(0, 1024));

const detectXmlFamily = (
  prefix: string,
): { format: DetectedFormat; signal: string } | undefined => {
  if (/<rss(?:\s|>)/i.test(prefix)) {
    return { format: "rss", signal: "rss-root" };
  }
  if (/<feed(?:\s|>)[^>]*xmlns=["'][^"']*Atom/i.test(prefix)) {
    return { format: "atom", signal: "atom-feed-root" };
  }
  if (/^<\?xml|^[\s\n]*<[A-Za-z_:][^>]*>/i.test(prefix)) {
    return { format: "xml", signal: "xml-structure" };
  }
  return undefined;
};

const detectFormat = (
  input: ResolvedInput,
): {
  format: DetectedFormat;
  confidence: number;
  mediaType?: string;
  signals: string[];
} => {
  const declared = mediaTypeOnly(input.mediaType);
  const prefix = input.content.slice(0, 4096).trimStart();

  if (looksLikeHtml(prefix)) {
    return {
      format: "html",
      confidence: 0.98,
      mediaType: "text/html",
      signals: ["html-root-or-doctype"],
    };
  }

  try {
    JSON.parse(prefix);
    return {
      format: "json",
      confidence: 0.95,
      mediaType: "application/json",
      signals: ["json-parse-success"],
    };
  } catch {
    // Continue with structural detection.
  }

  const xml = detectXmlFamily(prefix);
  if (xml !== undefined) {
    return {
      format: xml.format,
      confidence: 0.9,
      mediaType:
        xml.format === "rss" || xml.format === "atom"
          ? "application/xml"
          : declared,
      signals: [xml.signal],
    };
  }

  if (declared === "text/html" && /<[a-z][\s\S]*>/i.test(prefix)) {
    return {
      format: "html",
      confidence: 0.75,
      mediaType: "text/html",
      signals: ["declared-html", "markup-structure"],
    };
  }

  const textual =
    declared?.startsWith("text/") === true ||
    !input.content.includes("\u0000");
  return textual
    ? {
        format: "plain-text",
        confidence: declared === "text/plain" ? 0.95 : 0.65,
        mediaType: declared ?? "text/plain",
        signals: [declared === "text/plain" ? "declared-plain-text" : "utf8-text"],
      }
    : {
        format: "unknown",
        confidence: 0.9,
        mediaType: declared,
        signals: ["binary-signature"],
      };
};

export const probeContent = (input: ResolvedInput): ContentProbe => {
  const detected = detectFormat(input);
  const declared = mediaTypeOnly(input.mediaType);
  const signals = [...detected.signals];
  if (declared !== undefined && detected.mediaType !== undefined && declared !== detected.mediaType) {
    signals.push("declared-content-type-mismatch");
  }

  return {
    detectedMediaType: detected.mediaType,
    detectedFormat: detected.format,
    declaredMediaType: declared,
    formatConfidence: detected.confidence,
    structuralSignals: signals,
    isTextual: detected.format !== "unknown",
    handlerCandidates: [],
  };
};
