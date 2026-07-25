import { describe, expect, it } from "vitest";
import {
  normalizeUrlForIdentity,
  redactSensitiveQueryParameters,
  resolveCanonicalUrl,
  sanitizeUrlForLogging,
} from "../index";

describe("URL identity separation", () => {
  it("preserves identity-bearing query parameters", () => {
    expect(normalizeUrlForIdentity("https://example.com/doc?id=1")).not.toBe(
      normalizeUrlForIdentity("https://example.com/doc?id=2"),
    );
    expect(
      normalizeUrlForIdentity("https://example.com/doc?documentId=7&page=2"),
    ).toContain("documentId=7");
    expect(normalizeUrlForIdentity("https://example.com/doc?page=1")).not.toBe(
      normalizeUrlForIdentity("https://example.com/doc?page=2"),
    );
    expect(normalizeUrlForIdentity("https://example.com/doc?version=1")).not.toBe(
      normalizeUrlForIdentity("https://example.com/doc?version=2"),
    );
  });

  it("removes explicit tracking parameters and sorts the remainder", () => {
    expect(
      normalizeUrlForIdentity(
        "https://example.com/doc?utm_source=news&id=4&b=2&a=1",
      ),
    ).toBe("https://example.com/doc?a=1&b=2&id=4");
    expect(
      normalizeUrlForIdentity("https://example.com/doc?id=1&utm_source=a"),
    ).toBe(
      normalizeUrlForIdentity("https://example.com/doc?utm_source=b&id=1"),
    );
  });

  it("removes sensitive identity values while retaining document identity", () => {
    expect(
      normalizeUrlForIdentity("https://example.com/doc?id=1&session=private"),
    ).toBe("https://example.com/doc?id=1");
    expect(
      normalizeUrlForIdentity("https://example.com/doc?id=1&token=one"),
    ).toBe(
      normalizeUrlForIdentity("https://example.com/doc?token=two&id=1"),
    );
  });

  it("canonicalizes ordering, fragments, credentials, ports, and repeated values", () => {
    expect(
      normalizeUrlForIdentity("https://user:pass@EXAMPLE.com:443/doc?b=2&a=2&a=1#part"),
    ).toBe("https://example.com/doc?a=1&a=2&b=2");
  });

  it("redacts sensitive query values only for logging", () => {
    expect(
      redactSensitiveQueryParameters(
        "https://example.com/doc?id=4&token=secret",
      ),
    ).toBe("https://example.com/doc?id=4&token=%5BREDACTED%5D");
  });

  it("removes credentials and fragments from logs", () => {
    const value = sanitizeUrlForLogging(
      "https://user:pass@example.com/doc?id=4#part",
    );
    expect(value).toBe("https://example.com/doc?id=4");
    expect(value).not.toContain("user");
    expect(value).not.toContain("pass");
  });

  it("uses a validated explicit canonical URL before fallback", () => {
    expect(
      resolveCanonicalUrl(
        "https://canonical.example/doc?id=1",
        "https://fallback.example/doc",
      ),
    ).toBe("https://canonical.example/doc?id=1");
  });
});
