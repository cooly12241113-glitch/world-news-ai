import type { RenderableBriefing, RenderableScene } from "../../renderer/presentation-adapter";

export interface MyLensExposureViewModel {
  id: string;
  label: string;
  dimension: string;
  activeInScene: boolean;
}

export interface MyLensPathViewModel {
  key: string;
  mechanism: string;
  exposureLabels: string[];
  posture: string;
  conditions: string[];
  unknowns: string[];
}

export interface MyLensScenarioViewModel {
  key: string;
  label: string;
  premise: string;
  triggers: string[];
  counterSignals: string[];
  posture: string;
  unknowns: string[];
}

export interface MyLensViewModel {
  exposures: MyLensExposureViewModel[];
  paths: MyLensPathViewModel[];
  scenarios: MyLensScenarioViewModel[];
  hasSceneProjection: boolean;
  unknowns: string[];
}

export function createMyLensViewModel(
  briefing: RenderableBriefing,
  scene: RenderableScene,
): MyLensViewModel | undefined {
  const planning = briefing.personalizedImpactPlanningContext;
  if (!planning ||
    briefing.personalContextFingerprint !== planning.personalContextFingerprint ||
    briefing.personalizedImpactAnalysisFingerprint !== planning.analysisFingerprint) return undefined;
  const allBindings = briefing.scenes.flatMap(({ personalImpactBindings }) => personalImpactBindings);
  const validExposureIds = new Set(planning.exposures.map(({ exposureId }) => exposureId));
  const validChannelIds = new Set(planning.channels.map(({ channelId }) => channelId));
  const validAssessmentIds = new Set(planning.assessments.map(({ assessmentId }) => assessmentId));
  const validScenarioIds = new Set(planning.scenarios.map(({ scenarioId }) => scenarioId));
  if (!allBindings.length || allBindings.some(
    (binding) => binding.analysisFingerprint !== planning.analysisFingerprint ||
      binding.exposureIds.some((id) => !validExposureIds.has(id)) ||
      binding.impactChannelIds.some((id) => !validChannelIds.has(id)) ||
      binding.impactAssessmentIds.some((id) => !validAssessmentIds.has(id)) ||
      binding.scenarioIds.some((id) => !validScenarioIds.has(id)),
  )) return undefined;

  const exposureById = new Map(planning.exposures.map((item) => [item.exposureId, item]));
  const conditionById = new Map(planning.conditions.map((item) => [item.conditionId, item.statement]));
  const sceneExposureIds = new Set(scene.personalImpactBindings.flatMap(({ exposureIds }) => exposureIds));
  const channelIds = new Set(scene.personalImpactBindings.flatMap(({ impactChannelIds }) => impactChannelIds));
  const assessmentIds = new Set(scene.personalImpactBindings.flatMap(({ impactAssessmentIds }) => impactAssessmentIds));
  const scenarioIds = new Set(scene.personalImpactBindings.flatMap(({ scenarioIds }) => scenarioIds));
  const assessments = planning.assessments.filter(({ assessmentId }) => assessmentIds.has(assessmentId));
  const assessmentByExposure = new Map(assessments.map((item) => [item.exposureId, item]));
  const exposures = planning.exposures.map((exposure) => ({
    id: exposure.exposureId,
    label: exposureLabel(exposure.canonicalSubject),
    dimension: dimensionLabel(exposure.dimension),
    activeInScene: sceneExposureIds.has(exposure.exposureId),
  }));
  const paths = planning.channels.filter(({ channelId }) => channelIds.has(channelId)).map((channel) => {
    const relatedAssessments = channel.exposureIds
      .map((id) => assessmentByExposure.get(id)).filter((item) => item !== undefined);
    return {
      key: channel.channelId,
      mechanism: channel.mechanism,
      exposureLabels: channel.exposureIds.map((id) => exposureById.get(id))
        .filter((item) => item !== undefined).map((item) => exposureLabel(item.canonicalSubject)),
      posture: `${postureLabel(channel.epistemicType)} · ${directionLabel(channel.direction)}`,
      conditions: channel.conditionIds.map((id) => conditionById.get(id)).filter(isString),
      unknowns: unique([
        ...channel.uncertainty.unknowns,
        ...relatedAssessments.flatMap(({ uncertainty }) => uncertainty.unknowns),
      ]),
    };
  });
  const scenarios = planning.scenarios.filter(({ scenarioId }) => scenarioIds.has(scenarioId))
    .map((scenario) => ({
      key: scenario.scenarioId,
      label: `${scenario.horizon.amount}-${scenario.horizon.unit} ${scenario.kind} scenario`,
      premise: conditionById.get(scenario.premiseConditionId) ?? "The stated premise remains in force.",
      triggers: scenario.triggerConditionIds.map((id) => conditionById.get(id)).filter(isString),
      counterSignals: scenario.counterSignalConditionIds.map((id) => conditionById.get(id)).filter(isString),
      posture: `${directionLabel(scenario.expectedDirection)} · conditional scenario, not a probability forecast`,
      unknowns: scenario.uncertainty.unknowns,
    }));
  return {
    exposures, paths, scenarios,
    hasSceneProjection: scene.personalImpactBindings.length > 0,
    unknowns: unique([...paths.flatMap(({ unknowns }) => unknowns), ...scenarios.flatMap(({ unknowns }) => unknowns)]),
  };
}

const unique = (values: string[]) => [...new Set(values)];
const isString = (value: string | undefined): value is string => value !== undefined;
const exposureLabel = (subject: string) => subject === "KR" ? "South Korea"
  : subject === "semiconductor" ? "Semiconductor" : subject;
const dimensionLabel = (dimension: string) => dimension.split("-")
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
const postureLabel = (value: string) => value === "inference" ? "Conditional inference" : "Conditional outlook";
const directionLabel = (value: string) => ({
  increases: "Potential upward pressure", decreases: "Potential easing pressure",
  mixed: "Mixed direction", unchanged: "No indicated direction", uncertain: "Uncertain direction",
}[value] ?? "Uncertain direction");
