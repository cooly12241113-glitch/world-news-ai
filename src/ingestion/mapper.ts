import { createHash } from "node:crypto";
import type { SourceDocument } from "../domain";
import { SourceDocumentSchema } from "../validation";
import { IngestionError } from "./error";
import type { NormalizedDocument } from "./types";

const stableId = (prefix: string, value: string): string =>
  `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;

export const mapSourceDocument = (
  normalized: NormalizedDocument,
): SourceDocument => {
  const candidate: SourceDocument = {
    id: stableId("document", normalized.fingerprint),
    sourceId: stableId("source", normalized.sourceName.toLowerCase()),
    documentType: normalized.documentTypeCandidate,
    canonicalUrl: normalized.canonicalUrl,
    title: normalized.title,
    languageCode: normalized.language,
    publishedAt: normalized.publishedAt,
    retrievedAt: normalized.retrievedAt,
    authorNames: normalized.authors,
    contentText: normalized.body,
    entityIds: [],
    topicIds: [],
    eventIds: [],
  };

  const result = SourceDocumentSchema.safeParse(candidate);
  if (!result.success) {
    throw new IngestionError(
      "VALIDATION_FAILED",
      "Mapped SourceDocument failed runtime validation",
      "validate",
      {
        context: { issueCount: result.error.issues.length },
      },
    );
  }
  return result.data;
};
