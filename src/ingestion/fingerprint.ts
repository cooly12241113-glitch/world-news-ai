import { createHash } from "node:crypto";

export interface FingerprintInput {
  canonicalUrl: string;
  title: string;
  body: string;
}

export const generateFingerprint = (input: FingerprintInput): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        input.canonicalUrl.normalize("NFC"),
        input.title.normalize("NFC"),
        input.body.normalize("NFC"),
      ]),
      "utf8",
    )
    .digest("hex");
