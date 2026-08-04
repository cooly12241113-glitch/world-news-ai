import { describe, expect, it } from "vitest";
import {
  PersonalImpactContextSchema,
  createPersonalImpactContext,
  createUserExposure,
  validatePersonalImpactContext,
} from "..";

const consent = {
  enabled: true,
  purpose: "personalized-impact-analysis" as const,
};
const callerScope = {
  lifetime: "request-run" as const,
  propagation: "explicit-only" as const,
};

function context(exposures: ReturnType<typeof createUserExposure>[]) {
  return createPersonalImpactContext({
    contextVersion: "1",
    consent,
    callerScope,
    exposures,
  });
}

describe("explicit personal context contracts", () => {
  it("accepts enabled consent, the bounded purpose, and explicit exposures", () => {
    const result = validatePersonalImpactContext(context([
      createUserExposure({ dimension: "geography", countryCode: "kr" }),
      createUserExposure({ dimension: "currency", currencyCode: "usd" }),
    ]));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.outcome).toBe("enabled");
      expect(result.context.exposures).toHaveLength(2);
    }
  });

  it("supports only the seven bounded exposure dimensions", () => {
    const exposures = [
      createUserExposure({ dimension: "geography", countryCode: "KR" }),
      createUserExposure({ dimension: "currency", currencyCode: "USD" }),
      createUserExposure({ dimension: "industry", industry: "semiconductor" }),
      createUserExposure({ dimension: "asset-class", assetClass: "equity" }),
      createUserExposure({
        dimension: "employment-business",
        industry: "semiconductor",
        relationship: "employment",
      }),
      createUserExposure({ dimension: "consumption", category: "fuel" }),
      createUserExposure({
        dimension: "supply-chain",
        industry: "semiconductor",
        relationship: "imports",
      }),
    ];

    expect(context(exposures).exposures.map(({ dimension }) => dimension).sort())
      .toEqual([
        "asset-class",
        "consumption",
        "currency",
        "employment-business",
        "geography",
        "industry",
        "supply-chain",
      ]);
  });

  it("rejects exposures when personalization is disabled", () => {
    const exposure = createUserExposure({ dimension: "currency", currencyCode: "USD" });
    expect(() => createPersonalImpactContext({
      contextVersion: "1",
      consent: { ...consent, enabled: false },
      callerScope,
      exposures: [exposure],
    })).toThrow("Disabled personalization cannot carry exposures");
  });

  it("represents enabled consent without exposures as a structured state", () => {
    const result = validatePersonalImpactContext(context([]));
    expect(result.success && result.outcome).toBe("enabled-no-exposures");
  });

  it("represents disabled personalization without context as valid", () => {
    const value = createPersonalImpactContext({
      contextVersion: "1",
      consent: { ...consent, enabled: false },
      callerScope,
      exposures: [],
    });
    const result = validatePersonalImpactContext(value);
    expect(result.success && result.outcome).toBe("disabled");
  });

  it("rejects sensitive and arbitrary dimensions", () => {
    expect(() => createUserExposure({ dimension: "health", value: "private" }))
      .toThrow();
    expect(() => createUserExposure({ dimension: "custom", value: "anything" }))
      .toThrow();
  });

  it("rejects sensitive attributes disguised as textual exposure values", () => {
    expect(() => createUserExposure({ dimension: "industry", industry: "religion" }))
      .toThrow("Sensitive attributes");
  });

  it("rejects duplicate semantic exposures rather than silently deduplicating", () => {
    const first = createUserExposure({ dimension: "currency", currencyCode: "usd" });
    const second = createUserExposure({ dimension: "currency", currencyCode: "USD" });
    expect(() => context([first, second])).toThrow("Duplicate semantic exposure");
  });

  it("uses deterministic semantic exposure IDs", () => {
    const first = createUserExposure({ dimension: "currency", currencyCode: "usd" });
    const second = createUserExposure({ dimension: "currency", currencyCode: "USD" });
    expect(first.exposureId).toBe(second.exposureId);
    expect(first.exposureId).toMatch(/^exposure:currency:[a-f0-9]{64}$/u);
  });

  it("makes exposure order irrelevant to context identity", () => {
    const usd = createUserExposure({ dimension: "currency", currencyCode: "USD" });
    const korea = createUserExposure({ dimension: "geography", countryCode: "KR" });
    expect(context([usd, korea]).semanticFingerprint)
      .toBe(context([korea, usd]).semanticFingerprint);
  });

  it("normalizes NFC-equivalent exposure text", () => {
    const composed = createUserExposure({ dimension: "industry", industry: "반도체" });
    const decomposed = createUserExposure({
      dimension: "industry",
      industry: "반도체".normalize("NFD"),
    });
    expect(composed.exposureId).toBe(decomposed.exposureId);
    expect(context([composed]).semanticFingerprint)
      .toBe(context([decomposed]).semanticFingerprint);
  });

  it("changes identity when exposure semantics change", () => {
    const usd = context([createUserExposure({ dimension: "currency", currencyCode: "USD" })]);
    const eur = context([createUserExposure({ dimension: "currency", currencyCode: "EUR" })]);
    expect(usd.semanticFingerprint).not.toBe(eur.semanticFingerprint);
  });

  it("rejects a forged context fingerprint", () => {
    const value = context([
      createUserExposure({ dimension: "currency", currencyCode: "USD" }),
    ]);
    expect(PersonalImpactContextSchema.safeParse({
      ...value,
      semanticFingerprint: "0".repeat(64),
    }).success).toBe(false);
  });

  it("rejects arbitrary metadata, impact magnitude, and forged IDs", () => {
    expect(() => createUserExposure({
      dimension: "currency",
      currencyCode: "USD",
      metadata: { private: true },
    })).toThrow();
    expect(() => createUserExposure({
      dimension: "currency",
      currencyCode: "USD",
      qualitativeMagnitude: "high",
    })).toThrow();

    const value = context([
      createUserExposure({ dimension: "currency", currencyCode: "USD" }),
    ]);
    expect(PersonalImpactContextSchema.safeParse({
      ...value,
      exposures: [{ ...value.exposures[0], exposureId: "exposure:currency:" + "0".repeat(64) }],
    }).success).toBe(false);
  });

  it("rejects unknown context and consent properties", () => {
    const value = context([]);
    expect(PersonalImpactContextSchema.safeParse({ ...value, correlationId: "runtime" }).success)
      .toBe(false);
    expect(PersonalImpactContextSchema.safeParse({
      ...value,
      consent: { ...value.consent, consentedAt: "2026-08-04T00:00:00.000Z" },
    }).success).toBe(false);
  });
});
