import { IngestionError } from "./error";
import type {
  CapabilitySelection,
  ContentProbe,
  HandlerCandidate,
  IngestionCapability,
  ResolvedInput,
} from "./types";

export class CapabilityRegistry {
  readonly #capabilities = new Map<string, IngestionCapability>();

  register(capability: IngestionCapability): void {
    if (this.#capabilities.has(capability.id)) {
      throw new IngestionError(
        "INVALID_INPUT",
        `Duplicate capability id: ${capability.id}`,
        "select",
      );
    }
    this.#capabilities.set(capability.id, capability);
  }

  evaluate(input: ResolvedInput, probe: ContentProbe): HandlerCandidate[] {
    return [...this.#capabilities.values()]
      .map((capability) => {
        const match = capability.canHandle(input, probe);
        return {
          capabilityId: capability.id,
          score: match.supported ? match.score : 0,
          reasons: match.reasons,
        };
      })
      .sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
  }

  select(input: ResolvedInput, probe: ContentProbe): CapabilitySelection {
    const evaluations = this.evaluate(input, probe);
    const candidates = evaluations
      .filter(({ score }) => score > 0)
      .map((evaluation) => ({
        capability: this.#capabilities.get(evaluation.capabilityId)!,
        evaluation,
      }))
      .sort(
        (left, right) =>
          right.evaluation.score - left.evaluation.score ||
          right.capability.priority - left.capability.priority ||
          left.capability.id.localeCompare(right.capability.id),
      );

    const selected = candidates[0];
    if (selected === undefined) {
      throw new IngestionError(
        "NO_CAPABILITY_MATCH",
        "No registered capability supports the detected format",
        "select",
      );
    }

    return {
      capability: selected.capability,
      evaluations,
      selectedReasons: selected.evaluation.reasons,
    };
  }
}
