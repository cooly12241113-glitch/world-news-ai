import { randomUUID } from "node:crypto";
import type {
  GenerationAttempt, GenerationAuditRecord, GenerationPolicy,
  ProviderMetadata, ProviderUsage,
} from "./models";

export interface AuditBuilderInput {
  requestId: string; requestFingerprint: string; questionId: string; contractId: string;
  contextPackageId: string; contractFingerprint: string; contextPackageFingerprint: string;
  provider: ProviderMetadata; policy: GenerationPolicy; promptHash: string; startedAt: string;
}

export class GenerationAuditBuilder {
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  create(input: AuditBuilderInput, attempts: GenerationAttempt[], update: Partial<GenerationAuditRecord> = {}): GenerationAuditRecord {
    return {
      runId: this.createId(), requestId: input.requestId,
      requestFingerprint: input.requestFingerprint, questionId: input.questionId,
      contractId: input.contractId, contextPackageId: input.contextPackageId,
      contractFingerprint: input.contractFingerprint,
      contextPackageFingerprint: input.contextPackageFingerprint,
      providerId: input.provider.providerId, adapterId: input.provider.adapterId,
      adapterVersion: input.provider.adapterVersion, modelId: input.provider.modelId,
      promptTemplateId: input.policy.promptTemplateId,
      promptTemplateVersion: input.policy.promptTemplateVersion,
      promptHash: input.promptHash, proposalSchemaVersion: input.policy.proposalSchemaVersion,
      planSchemaVersion: input.policy.planSchemaVersion,
      validationPolicyVersion: input.policy.version,
      startedAt: input.startedAt, completedAt: this.now().toISOString(),
      attempts, repairCount: attempts.filter(({ kind }) => kind === "repair").length,
      redactionApplied: true, warnings: [], ...update,
    };
  }
}

export function mergeUsage(values: ProviderUsage[]): ProviderUsage | undefined {
  if (values.length === 0) return undefined;
  const sum = (key: keyof ProviderUsage) => {
    const present = values.map((value) => value[key]).filter((value): value is number => value !== undefined);
    return present.length ? present.reduce((total, value) => total + value, 0) : undefined;
  };
  return {
    ...(sum("inputTokens") !== undefined ? { inputTokens: sum("inputTokens")! } : {}),
    ...(sum("outputTokens") !== undefined ? { outputTokens: sum("outputTokens")! } : {}),
    ...(sum("totalTokens") !== undefined ? { totalTokens: sum("totalTokens")! } : {}),
    ...(sum("cachedTokens") !== undefined ? { cachedTokens: sum("cachedTokens")! } : {}),
    ...(sum("reasoningTokens") !== undefined ? { reasoningTokens: sum("reasoningTokens")! } : {}),
  };
}
