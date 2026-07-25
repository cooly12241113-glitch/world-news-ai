import { describe, expect, it } from "vitest";
import { ExplanationPlanProposalHydrator } from "../hydrator";
import { validateProposal } from "../proposal";
import { ExplanationPlanLlmRequestBuilder } from "../request-builder";
import { ExplanationPlanProposalSchema } from "../validation";
import { input, now, proposal } from "./fixtures";

describe("proposal validation and hydration", () => {
  it("strictly accepts the proposal and rejects forbidden fields", () => {
    expect(ExplanationPlanProposalSchema.safeParse(proposal()).success).toBe(true);
    expect(ExplanationPlanProposalSchema.safeParse({ ...proposal(), finalAnswer: "invented" }).success).toBe(false);
    expect(ExplanationPlanProposalSchema.safeParse({ ...proposal(), chainOfThought: "private" }).success).toBe(false);
  });

  it.each([
    ["context", (value: ReturnType<typeof proposal>) => { value.sections[0]!.contextItemIds = ["missing"]; }],
    ["excerpt", (value: ReturnType<typeof proposal>) => { value.sections[0]!.steps[0]!.evidenceBindings[0]!.excerptIds = ["missing"]; }],
    ["provenance", (value: ReturnType<typeof proposal>) => { value.sections[0]!.steps[0]!.evidenceBindings[0]!.provenanceRecordIds = ["missing"]; }],
    ["source", (value: ReturnType<typeof proposal>) => { value.sections[0]!.steps[0]!.evidenceBindings[0]!.sourceDocumentIds = ["missing"]; }],
    ["visual local", (value: ReturnType<typeof proposal>) => {
      if (value.visualIntents[0]) value.visualIntents[0].relatedSectionKeys = ["missing-section"];
    }],
  ])("rejects disallowed %s reference", (_name, mutate) => {
    const request = new ExplanationPlanLlmRequestBuilder().build(input());
    const value = proposal(); mutate(value);
    expect(validateProposal(value, request.allowedReferenceCatalog).success).toBe(false);
  });

  it("rejects duplicate and broken local keys", () => {
    const request = new ExplanationPlanLlmRequestBuilder().build(input());
    const duplicate = proposal();
    duplicate.sections[1]!.localKey = duplicate.sections[0]!.localKey;
    expect(validateProposal(duplicate, request.allowedReferenceCatalog).success).toBe(false);
    const broken = proposal();
    broken.sections[0]!.steps[0]!.dependencyLocalKeys = ["missing-step"];
    expect(validateProposal(broken, request.allowedReferenceCatalog).success).toBe(false);
  });

  it("hydrates stable IDs and converts dependencies and visual references", () => {
    const generation = input();
    const request = new ExplanationPlanLlmRequestBuilder().build(generation);
    const value = proposal();
    const validated = validateProposal(value, request.allowedReferenceCatalog);
    if (!validated.success) throw new Error(validated.error.message);
    const hydrate = (proposalValue = validated.proposal) => new ExplanationPlanProposalHydrator().hydrate(proposalValue, {
      request, contract: generation.briefingContract,
      contextPackage: generation.evidenceContextPackage, now,
      generator: { type: "llm", id: "fake", version: "1" },
      planVersion: "explanation-plan-v1", policyVersion: "generation-v1",
    });
    const first = hydrate();
    const second = hydrate(structuredClone(validated.proposal));
    expect(first.success && second.success).toBe(true);
    expect(first.plan?.id).toBe(second.plan?.id);
    expect(first.plan?.fingerprint).toBe(second.plan?.fingerprint);
  });
});
