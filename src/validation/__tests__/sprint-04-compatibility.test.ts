import { describe, expect, expectTypeOf, it } from "vitest";
import type { Article, Event, Source, SourceDocument } from "../../domain";
import {
  ArticleSchema,
  EventSchema,
  SourceDocumentSchema,
  SourceSchema,
} from "../index";
import {
  articleFixture,
  eventFixture,
  sourceFixture,
} from "./fixtures";

describe("Sprint-04 compatibility", () => {
  it("preserves the Sprint-03 Source, Article, and Event contracts", () => {
    expect(SourceSchema.parse(sourceFixture)).toEqual(sourceFixture);
    expect(ArticleSchema.parse(articleFixture)).toEqual(articleFixture);
    expect(EventSchema.parse(eventFixture)).toEqual(eventFixture);

    expectTypeOf(sourceFixture).toMatchTypeOf<Source>();
    expectTypeOf(articleFixture).toMatchTypeOf<Article>();
    expectTypeOf(eventFixture).toMatchTypeOf<Event>();
  });

  it("links SourceDocument to existing events without changing Event", () => {
    const document: SourceDocument = {
      id: articleFixture.id,
      sourceId: articleFixture.sourceId,
      documentType: "NewsArticle",
      canonicalUrl: articleFixture.canonicalUrl,
      title: articleFixture.title,
      languageCode: articleFixture.languageCode,
      publishedAt: articleFixture.publishedAt,
      retrievedAt: articleFixture.fetchedAt,
      authorNames: articleFixture.authorNames,
      summary: articleFixture.summary,
      contentText: articleFixture.bodyText,
      entityIds: articleFixture.entityIds,
      topicIds: articleFixture.topicIds,
      eventIds: articleFixture.eventIds,
    };

    expect(SourceDocumentSchema.safeParse(document).success).toBe(true);
    expect(document.eventIds).toContain(eventFixture.id);
    expect(eventFixture.articleIds).toContain(articleFixture.id);
  });
});
