import { createHash } from "node:crypto";
import { normalizeUrlForIdentity } from "../domain";
import type { SourceLocator } from "./models";

const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");

export const sourceLocatorSemanticValue = (locator: SourceLocator): unknown =>
  locator.kind === "web"
    ? { kind: locator.kind, url: normalizeUrlForIdentity(locator.url) }
    : {
        kind: locator.kind,
        submissionId: locator.submissionId.normalize("NFC"),
      };

export const createSourceIdentity = (locator: SourceLocator): string =>
  `source-locator:${hash(sourceLocatorSemanticValue(locator))}`;

export const createRawArtifactId = (
  sourceIdentity: string,
  contentHash: string,
): string => `raw-artifact:${hash({ sourceIdentity, contentHash })}`;

export const createContentHash = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex");
