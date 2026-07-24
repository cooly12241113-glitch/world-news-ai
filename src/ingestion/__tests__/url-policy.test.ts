import { describe, expect, it } from "vitest";
import { IngestionError, normalizeCanonicalUrl, validatePublicUrl } from "../index";

describe("URL policy", () => {
  it("accepts public HTTP and HTTPS URLs", () => {
    expect(validatePublicUrl("https://example.com/a").hostname).toBe("example.com");
    expect(validatePublicUrl("http://example.com/a").protocol).toBe("http:");
  });

  it.each([
    "ftp://example.com/file",
    "not a url",
  ])("rejects invalid URL %s", (url) => {
    expect(() => validatePublicUrl(url)).toThrow(IngestionError);
  });

  it.each([
    "https://user:password@example.com",
    "http://localhost/path",
    "http://sub.localhost/path",
    "http://127.0.0.1/path",
    "http://10.1.2.3/path",
    "http://172.16.1.1/path",
    "http://192.168.1.1/path",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/path",
    "http://[fc00::1]/path",
  ])("rejects unsafe URL %s", (url) => {
    try {
      validatePublicUrl(url);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(IngestionError);
      expect((error as IngestionError).details.code).toBe("UNSAFE_URL");
    }
  });

  it("normalizes a relative canonical URL and removes fragments", () => {
    expect(
      normalizeCanonicalUrl("/report#details", "https://example.com/source"),
    ).toBe("https://example.com/report");
  });
});
