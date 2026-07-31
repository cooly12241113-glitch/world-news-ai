import type { BriefingQuestion } from "@world-news-ai/briefing";
import type { EvidenceCandidate } from "@world-news-ai/context";
import type { DataPoint, Entity, SourceDocument } from "@world-news-ai/domain";
import { canonicalMapLocationIds } from "../../fixtures/canonical-map-impact";

export const LOCAL_FIXTURE_EVENT_ID = "event:semiconductor-supply";
export const LOCAL_FIXTURE_DOCUMENT_ID = "document:local-primary";

export function createLocalFixtureQuestion(now: string): BriefingQuestion {
  return {
    id: "question:local-briefing",
    text: "How could East Asian technology policy affect the semiconductor supply chain?",
    language: "en",
    submittedAt: now,
    referencedEventIds: [LOCAL_FIXTURE_EVENT_ID],
    referencedEntityIds: canonicalMapLocationIds.map((id) => `entity:${id}`),
    userProvidedContext: { locations: canonicalMapLocationIds },
    personalizationRequested: false,
  };
}

export function createLocalFixtureLocations(): Entity[] {
  return canonicalMapLocationIds.map((locationId) => ({
    id: `entity:${locationId}`,
    type: locationId === "world" || locationId === "east-asia" ? "location" : "country",
    canonicalName: locationId,
    aliases: [],
    description: `Canonical fixture location ${locationId}.`,
  }));
}

export function createLocalFixtureLocationCandidates(now: string): EvidenceCandidate[] {
  return createLocalFixtureLocations().map((entity) => {
    const documentId = `document:fixture-location:${entity.canonicalName}`;
    return {
    id: `fixture-location:${entity.id}`,
    recordType: "source-document",
    recordId: documentId,
    eventIds: [LOCAL_FIXTURE_EVENT_ID],
    dossierIds: [],
    sourceDocumentIds: [documentId],
    title: entity.canonicalName,
    searchableText: `Semiconductor supply-chain fixture location ${entity.canonicalName}.`,
    publishedAt: now,
    retrievedAt: now,
    sourceType: "GovernmentDocument",
    sourceName: `fixture-location:${entity.id}`,
    documentType: "GovernmentDocument",
    language: "en",
    locations: [entity.canonicalName],
    domains: ["supply-chain", "technology"],
    entityIds: [entity.id],
    claimIds: [],
    evidenceLinkIds: [],
    dataPointIds: [],
    primarySource: true,
    structuredMetadata: { fixture: true },
    provenance: { canonicalIdentity: `fixture://${entity.id}`, observedAt: now },
  }; });
}

export function createLocalFixtureLocationDocuments(now: string): SourceDocument[] {
  return createLocalFixtureLocations().map((entity) => ({
    id: `document:fixture-location:${entity.canonicalName}`,
    sourceId: `source:fixture-location:${entity.canonicalName}`,
    documentType: "GovernmentDocument",
    canonicalUrl: `https://fixture.invalid/location/${entity.canonicalName}`,
    title: `Fixture location record: ${entity.canonicalName}`,
    languageCode: "en",
    publishedAt: now,
    retrievedAt: now,
    authorNames: ["Fixture Geography Catalog"],
    contentText: `Semiconductor supply-chain fixture location ${entity.canonicalName}.`,
    entityIds: [entity.id],
    topicIds: [],
    eventIds: [LOCAL_FIXTURE_EVENT_ID],
  }));
}

export function createLocalFixtureDocuments(now: string): SourceDocument[] {
  return [
    {
      id: LOCAL_FIXTURE_DOCUMENT_ID,
      sourceId: "source:local-agency",
      documentType: "GovernmentDocument",
      canonicalUrl: "https://fixture.invalid/technology-policy",
      title: "Fixture technology policy statement",
      languageCode: "en",
      publishedAt: now,
      retrievedAt: now,
      authorNames: ["Fixture Agency"],
      contentText: "Fixture evidence describes policy controls affecting semiconductor supply routes across East Asia.",
      entityIds: [], topicIds: [], eventIds: [LOCAL_FIXTURE_EVENT_ID],
    },
    {
      id: "document:local-independent",
      sourceId: "source:local-independent",
      documentType: "NewsArticle",
      canonicalUrl: "https://fixture.invalid/supply-chain-analysis",
      title: "Fixture independent supply-chain analysis",
      languageCode: "en",
      publishedAt: now,
      retrievedAt: now,
      authorNames: ["Fixture Reporter"],
      contentText: "Independent fixture evidence links policy changes with rerouting, delays, and uncertain downstream costs.",
      entityIds: [], topicIds: [], eventIds: [LOCAL_FIXTURE_EVENT_ID],
    },
  ];
}

export function createLocalFixtureDataPoint(now: string): DataPoint {
  return {
    id: "data:exposure-index",
    sourceDocumentId: LOCAL_FIXTURE_DOCUMENT_ID,
    name: "Supply-chain exposure index",
    value: 68,
    unit: "/100",
    observedAt: now,
    confidence: "medium",
    entityIds: ["entity:east-asia", "entity:south-korea"],
    eventIds: [LOCAL_FIXTURE_EVENT_ID],
  };
}
