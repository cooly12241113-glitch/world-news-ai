import type {
  Analysis,
  Article,
  Entity,
  Event,
  Source,
  Topic,
} from "../../domain";

export const sourceFixture: Source = {
  id: "source-1",
  name: "World News",
  type: "news_outlet",
  homepageUrl: "https://example.com",
  countryCode: "KR",
  primaryLanguageCode: "ko",
  description: "An international news source",
};

export const articleFixture: Article = {
  id: "article-1",
  sourceId: "source-1",
  canonicalUrl: "https://example.com/articles/1",
  title: "A world event",
  languageCode: "en-US",
  publishedAt: "2026-07-24T01:30:00.000Z",
  fetchedAt: "2026-07-24T10:30:00+09:00",
  authorNames: ["Reporter One"],
  summary: "Article summary",
  bodyText: "Article body",
  entityIds: ["entity-1"],
  topicIds: ["topic-1"],
  eventIds: ["event-1"],
};

export const entityFixture: Entity = {
  id: "entity-1",
  type: "country",
  canonicalName: "Republic of Korea",
  aliases: ["South Korea", "Korea"],
  countryCode: "KR",
  description: "A country in East Asia",
};

export const topicFixture: Topic = {
  id: "topic-1",
  name: "Geopolitics",
  slug: "geopolitics",
  description: "International political relations",
  parentTopicId: "topic-root",
};

export const eventFixture: Event = {
  id: "event-1",
  title: "Regional summit",
  summary: "Leaders attended a regional summit",
  status: "confirmed",
  confidence: "high",
  startedAt: "2026-07-24T01:30:00.000Z",
  endedAt: "2026-07-24T03:30:00.000Z",
  articleIds: ["article-1"],
  entityIds: ["entity-1"],
  topicIds: ["topic-1"],
  locationEntityIds: [],
  createdAt: "2026-07-24T04:00:00.000Z",
  updatedAt: "2026-07-24T05:00:00.000Z",
};

export const analysisFixture: Analysis = {
  id: "analysis-1",
  targetType: "event",
  targetId: "event-1",
  kind: "impact",
  title: "Summit impact",
  summary: "The summit may affect regional cooperation",
  keyPoints: ["Cooperation may increase"],
  confidence: "medium",
  evidenceArticleIds: ["article-1"],
  caveats: ["Outcomes remain uncertain"],
  modelName: "analysis-system",
  generatedAt: "2026-07-24T06:00:00.000Z",
};
