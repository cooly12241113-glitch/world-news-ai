import { describe, expect, it } from "vitest";
import {
  PersonalizedImpactAnalyzer,
  PersonalizedImpactValidator,
  createPersonalImpactContext,
  createUserExposure,
} from "..";
import {
  deterministicImpactPolicy,
  impactInput,
  rekeyProposal,
} from "./impact-fixtures";

describe("personalized impact channel and scenario domain", () => {
  it("builds a valid analysis with separate evidence and exposure provenance", () => {
    const result = analyze();
    expect(result.success && result.outcome).toBe("completed");
    if (!result.success || result.outcome !== "completed") return;

    expect(result.analysis.channels.every((channel) =>
      channel.evidenceContextItemIds.length > 0 && channel.exposureIds.length > 0
    )).toBe(true);
    expect(result.analysis.personalContextFingerprint).toHaveLength(64);
    expect(result.analysis.evidenceContextFingerprint).toHaveLength(64);
  });

  it("rejects an unknown evidence reference", () => {
    const result = analyze((proposal) => {
      proposal.channels[0]!.evidenceContextItemIds = ["context-item:unknown"];
      return rekeyProposal(proposal);
    });
    expect(issueCodes(result)).toContain("UNKNOWN_EVIDENCE_REFERENCE");
  });

  it("rejects an unknown or inferred exposure reference", () => {
    const result = analyze((proposal) => {
      proposal.channels[0]!.exposureIds = ["exposure:geography:not-supplied"];
      return rekeyProposal(proposal);
    });
    expect(issueCodes(result)).toContain("UNKNOWN_EXPOSURE_REFERENCE");
  });

  it("rejects unknown condition and channel references", () => {
    const condition = analyze((proposal) => {
      proposal.channels[0]!.conditionIds = ["impact-condition:unknown"];
      return rekeyProposal(proposal);
    });
    const channel = analyze((proposal) => {
      proposal.assessments[0]!.channelIds = ["impact-channel:unknown"];
      return rekeyProposal(proposal);
    });
    expect(issueCodes(condition)).toContain("UNKNOWN_CONDITION_REFERENCE");
    expect(issueCodes(channel)).toContain("UNKNOWN_CHANNEL_REFERENCE");
  });

  it("keeps the analysis fingerprint stable across array ordering", () => {
    const first = analyze();
    const second = analyze((proposal) => ({
      ...proposal,
      conditions: [...proposal.conditions].reverse(),
      channels: [...proposal.channels].reverse(),
      assessments: [...proposal.assessments].reverse(),
      scenarios: [...proposal.scenarios].reverse(),
      unknowns: [...proposal.unknowns].reverse(),
      limitations: [...proposal.limitations].reverse(),
    }));
    expect(fingerprint(first)).toBe(fingerprint(second));
  });

  it("changes the analysis fingerprint when USD exposure changes to EUR", () => {
    const usd = analyze(undefined, impactInput([
      { dimension: "currency", currencyCode: "USD" },
    ]));
    const eur = analyze(undefined, impactInput([
      { dimension: "currency", currencyCode: "EUR" },
    ]));
    expect(fingerprint(usd)).not.toBe(fingerprint(eur));
  });

  it("returns unavailable for enabled consent without exposures", () => {
    const input = impactInput();
    input.personalContext = createPersonalImpactContext({
      contextVersion: "1",
      consent: { enabled: true, purpose: "personalized-impact-analysis" },
      callerScope: { lifetime: "request-run", propagation: "explicit-only" },
      exposures: [],
    });
    const result = new PersonalizedImpactAnalyzer(deterministicImpactPolicy()).analyze(input);
    expect(result).toEqual({
      success: true,
      outcome: "insufficient-context",
      reason: "no-exposures",
    });
  });

  it("returns unavailable without using context when consent is disabled", () => {
    const input = impactInput();
    input.personalContext = createPersonalImpactContext({
      contextVersion: "1",
      consent: { enabled: false, purpose: "personalized-impact-analysis" },
      callerScope: { lifetime: "request-run", propagation: "explicit-only" },
      exposures: [],
    });
    const result = new PersonalizedImpactAnalyzer(deterministicImpactPolicy()).analyze(input);
    expect(result).toEqual({
      success: true,
      outcome: "insufficient-context",
      reason: "personalization-disabled",
    });
  });

  it("returns insufficient evidence before invoking impact mapping", () => {
    const input = impactInput();
    input.evidenceContextPackage = {
      ...input.evidenceContextPackage,
      status: "insufficient-evidence",
    };
    const result = new PersonalizedImpactAnalyzer(deterministicImpactPolicy()).analyze(input);
    expect(result).toEqual({
      success: true,
      outcome: "insufficient-evidence",
      reason: "evidence-context-not-ready",
    });
  });

  it("accepts a conditional scenario with structured horizon and counter-signal", () => {
    const result = analyze();
    if (!result.success || result.outcome !== "completed") throw new Error("Expected analysis");
    expect(result.analysis.scenarios[0]).toMatchObject({
      kind: "baseline",
      horizon: { amount: 3, unit: "month" },
      expectedDirection: "mixed",
    });
    expect(result.analysis.scenarios[0]!.counterSignalConditionIds).toHaveLength(1);
  });

  it("rejects a scenario without a horizon", () => {
    const result = analyze((proposal) => {
      delete (proposal.scenarios[0] as Partial<typeof proposal.scenarios[number]>).horizon;
      return proposal;
    });
    expect(issueCodes(result)).toContain("ANALYSIS_SCHEMA_INVALID");
  });

  it("rejects invented probability and recommendation fields structurally", () => {
    const probability = analyze((proposal) => {
      Object.assign(proposal.scenarios[0]!, { probability: 0.72 });
      return proposal;
    });
    const recommendation = analyze((proposal) => {
      Object.assign(proposal.assessments[0]!, {
        recommendation: "buy",
        targetWeight: 0.65,
      });
      return proposal;
    });
    expect(issueCodes(probability)).toContain("ANALYSIS_SCHEMA_INVALID");
    expect(issueCodes(recommendation)).toContain("ANALYSIS_SCHEMA_INVALID");
  });

  it("keeps qualitative magnitude and ranking outside the schema", () => {
    const result = analyze((proposal) => {
      Object.assign(proposal.assessments[0]!, {
        qualitativeMagnitude: "high",
        importanceScore: 0.9,
      });
      return proposal;
    });
    expect(issueCodes(result)).toContain("ANALYSIS_SCHEMA_INVALID");
  });

  it("accepts a countervailing impact channel", () => {
    const result = analyze();
    if (!result.success || result.outcome !== "completed") throw new Error("Expected analysis");
    expect(result.analysis.channels.some(({ relation }) => relation === "countervailing"))
      .toBe(true);
  });

  it("supports explicit unknown impact without promoting its posture", () => {
    const result = analyze((proposal) => {
      const channel = proposal.channels[0]!;
      channel.relation = "unknown";
      channel.direction = "uncertain";
      channel.epistemicType = "unknown";
      channel.uncertainty = {
        posture: "indeterminate",
        statement: "Evidence and exposure exist, but the transmission path remains unresolved.",
        unknowns: ["The causal link is unsupported."],
      };
      return rekeyProposal(proposal);
    });
    expect(fingerprint(result)).toHaveLength(64);
  });

  it("rejects an invalid unknown-impact posture", () => {
    const result = analyze((proposal) => {
      proposal.channels[0]!.relation = "unknown";
      return rekeyProposal(proposal);
    });
    expect(issueCodes(result)).toContain("UNKNOWN_POSTURE_INVALID");
  });

  it("rejects duplicate semantic impact channels", () => {
    const result = analyze((proposal) => {
      proposal.channels.push({ ...proposal.channels[0]! });
      return proposal;
    });
    expect(issueCodes(result)).toContain("DUPLICATE_SEMANTIC_IDENTITY");
  });

  it("normalizes NFC-equivalent mechanism text in semantic identity", () => {
    const composed = analyze((proposal) => {
      proposal.channels[0]!.mechanism = "Café transmission channel";
      return rekeyProposal(proposal);
    });
    const decomposed = analyze((proposal) => {
      proposal.channels[0]!.mechanism = "Café transmission channel".normalize("NFD");
      return rekeyProposal(proposal);
    });
    expect(fingerprint(composed)).toBe(fingerprint(decomposed));
  });

  it("rejects a causal jump with an empty mechanism", () => {
    const result = analyze((proposal) => {
      proposal.channels[0]!.mechanism = "  ";
      return proposal;
    });
    expect(issueCodes(result)).toContain("ANALYSIS_SCHEMA_INVALID");
  });

  it("rejects an assessment without a channel", () => {
    const result = analyze((proposal) => {
      proposal.assessments[0]!.channelIds = [];
      return proposal;
    });
    expect(issueCodes(result)).toContain("ANALYSIS_SCHEMA_INVALID");
  });

  it("returns a structured unsupported outcome when no mapping exists", () => {
    const result = new PersonalizedImpactAnalyzer(
      deterministicImpactPolicy(() => undefined),
    ).analyze(impactInput());
    expect(result).toEqual({
      success: true,
      outcome: "unsupported-impact-path",
      reason: "no-supported-mapping",
    });
  });

  it("rejects stale personal and evidence fingerprint lineage", () => {
    const input = impactInput();
    const completed = new PersonalizedImpactAnalyzer(deterministicImpactPolicy()).analyze(input);
    if (!completed.success || completed.outcome !== "completed") throw new Error("Expected analysis");
    const validator = new PersonalizedImpactValidator();
    const staleEvidence = validator.validate(input, {
      ...completed.analysis,
      evidenceContextFingerprint: "0".repeat(64),
    });
    const stalePersonalInput = {
      ...input,
      personalContext: {
        ...input.personalContext,
        semanticFingerprint: "0".repeat(64),
      },
    };
    const stalePersonal = validator.validate(stalePersonalInput, completed.analysis);

    expect(staleEvidence.outcome === "invalid" && staleEvidence.issues.map(({ code }) => code))
      .toContain("EVIDENCE_CONTEXT_FINGERPRINT_MISMATCH");
    expect(stalePersonal.outcome === "invalid" && stalePersonal.issues.map(({ code }) => code))
      .toContain("INPUT_INVALID");
  });
});

type Transform = Parameters<typeof deterministicImpactPolicy>[0];

function analyze(transform?: Transform, input = impactInput()) {
  return new PersonalizedImpactAnalyzer(deterministicImpactPolicy(transform)).analyze(input);
}

function issueCodes(result: ReturnType<typeof analyze>): string[] {
  return result.success ? [] : result.issues.map(({ code }) => code);
}

function fingerprint(result: ReturnType<typeof analyze>): string {
  if (!result.success || result.outcome !== "completed") {
    throw new Error(`Expected completed analysis, got ${result.outcome}.`);
  }
  return result.analysis.semanticFingerprint;
}
