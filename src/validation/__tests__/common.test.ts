import { describe, expect, it } from "vitest";
import {
  ConfidenceLevelSchema,
  CountryCodeSchema,
  ISODateStringSchema,
  IdSchema,
  LanguageCodeSchema,
  NonEmptyStringSchema,
  UniqueIdArraySchema,
  URLStringSchema,
} from "../common";

describe("common schemas", () => {
  it.each(["World News", " value "])("accepts non-empty strings", (value) => {
    expect(NonEmptyStringSchema.parse(value)).toBe(value);
  });

  it.each(["", "   ", 1, null])("rejects invalid non-empty strings", (value) => {
    expect(NonEmptyStringSchema.safeParse(value).success).toBe(false);
  });

  it("accepts unrestricted non-empty IDs without coercion", () => {
    expect(IdSchema.parse("custom-id")).toBe("custom-id");
    expect(IdSchema.safeParse(123).success).toBe(false);
  });

  it.each([
    "2026-07-24T01:30:00.000Z",
    "2026-07-24T10:30:00+09:00",
  ])("accepts timezone-aware datetimes", (value) => {
    expect(ISODateStringSchema.parse(value)).toBe(value);
  });

  it.each(["2026-07-24", "2026-07-24 10:30", "2026-07-24T10:30:00"])(
    "rejects invalid or timezone-free datetimes",
    (value) => expect(ISODateStringSchema.safeParse(value).success).toBe(false),
  );

  it.each(["http://example.com", "https://example.com/path"])(
    "accepts HTTP(S) URLs unchanged",
    (value) => expect(URLStringSchema.parse(value)).toBe(value),
  );

  it.each(["/path", "mailto:a@example.com", "file:///tmp/a", "javascript:alert(1)"])(
    "rejects unsupported URLs",
    (value) => expect(URLStringSchema.safeParse(value).success).toBe(false),
  );

  it.each(["ko", "en", "en-US", "zh-CN"])("accepts language codes", (value) => {
    expect(LanguageCodeSchema.safeParse(value).success).toBe(true);
  });

  it.each(["k", "english", "en_US"])("rejects invalid language codes", (value) => {
    expect(LanguageCodeSchema.safeParse(value).success).toBe(false);
  });

  it.each(["KR", "US", "JP"])("accepts country codes", (value) => {
    expect(CountryCodeSchema.safeParse(value).success).toBe(true);
  });

  it.each(["kr", "KOR", "K"])("rejects invalid country codes", (value) => {
    expect(CountryCodeSchema.safeParse(value).success).toBe(false);
  });

  it.each(["low", "medium", "high"])("accepts confidence levels", (value) => {
    expect(ConfidenceLevelSchema.safeParse(value).success).toBe(true);
  });

  it("rejects invalid confidence levels", () => {
    expect(ConfidenceLevelSchema.safeParse("certain").success).toBe(false);
  });

  it("accepts empty and ordered unique ID arrays", () => {
    expect(UniqueIdArraySchema.parse([])).toEqual([]);
    expect(UniqueIdArraySchema.parse(["b", "a"])).toEqual(["b", "a"]);
  });

  it("rejects duplicate, empty, and non-string IDs", () => {
    expect(UniqueIdArraySchema.safeParse(["a", "a"]).success).toBe(false);
    expect(UniqueIdArraySchema.safeParse([""]).success).toBe(false);
    expect(UniqueIdArraySchema.safeParse([1]).success).toBe(false);
  });
});
