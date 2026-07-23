# TypeScript Domain Contract

## 문서 상태

- Version: `1.0`
- Status: Approved for Sprint-02
- Scope: Core domain types only

이 문서는 World News AI의 핵심 데이터 구조를 정의한다.

Codex는 Sprint-02에서 이 계약을 그대로 TypeScript 코드로 구현해야 한다. 임의로 필드를 추가하거나 이름을 변경해서는 안 된다.

---

## 1. 설계 목표

핵심 도메인 모델은 다음 원칙을 따른다.

- TypeScript strict mode에서 동작한다.
- 모든 도메인 객체는 명확한 타입을 가진다.
- 객체 관계는 중첩 객체가 아니라 ID로 참조한다.
- 날짜는 JavaScript `Date` 객체가 아니라 ISO 8601 문자열로 저장한다.
- 선택 필드는 `null`보다 `undefined`를 사용한다.
- `any` 타입은 사용하지 않는다.
- 데이터베이스, API, UI 프레임워크에 종속되지 않는다.
- JSON으로 직렬화할 수 있어야 한다.

---

## 2. 공통 타입

```ts
export type Id = string;

export type ISODateString = string;

export type URLString = string;

export type LanguageCode = string;

export type CountryCode = string;

export type ConfidenceLevel = "low" | "medium" | "high";
```

### 규칙

#### `Id`

- 모든 ID는 문자열이다.
- ID 내부 구조를 해석해서는 안 된다.
- UUID, CUID 또는 데이터베이스 ID를 사용할 수 있다.
- 도메인 계층은 ID 생성 방식에 의존하지 않는다.

#### `ISODateString`

- ISO 8601 형식의 문자열이어야 한다.
- 가능한 경우 UTC 형식을 사용한다.

예시:

```text
2026-07-23T15:30:00.000Z
```

#### `LanguageCode`

BCP 47 형식의 언어 코드를 사용한다.

예시:

```text
ko
en
en-US
zh-CN
```

#### `CountryCode`

ISO 3166-1 alpha-2 국가 코드를 사용한다.

예시:

```text
KR
US
JP
CN
```

---

## 3. Source

뉴스 기사나 정보가 수집된 출처를 나타낸다.

```ts
export type SourceType =
  | "news_outlet"
  | "government"
  | "international_organization"
  | "research_institution"
  | "nonprofit"
  | "social_media"
  | "other";

export interface Source {
  id: Id;
  name: string;
  type: SourceType;
  homepageUrl: URLString;
  countryCode?: CountryCode;
  primaryLanguageCode?: LanguageCode;
  description?: string;
}
```

### 필드 설명

| 필드 | 필수 | 설명 |
|---|---:|---|
| `id` | 필수 | 출처 고유 ID |
| `name` | 필수 | 출처 이름 |
| `type` | 필수 | 출처 유형 |
| `homepageUrl` | 필수 | 공식 홈페이지 URL |
| `countryCode` | 선택 | 출처의 주된 국가 |
| `primaryLanguageCode` | 선택 | 출처의 주 언어 |
| `description` | 선택 | 출처에 대한 간단한 설명 |

---

## 4. Article

수집된 개별 뉴스 기사 또는 원문 자료를 나타낸다.

```ts
export interface Article {
  id: Id;
  sourceId: Id;
  canonicalUrl: URLString;
  title: string;
  languageCode: LanguageCode;
  publishedAt: ISODateString;
  fetchedAt: ISODateString;

  authorNames: string[];
  summary?: string;
  bodyText?: string;

  entityIds: Id[];
  topicIds: Id[];
  eventIds: Id[];
}
```

### 필드 설명

| 필드 | 필수 | 설명 |
|---|---:|---|
| `id` | 필수 | 기사 고유 ID |
| `sourceId` | 필수 | 출처의 `Source.id` |
| `canonicalUrl` | 필수 | 기사의 대표 URL |
| `title` | 필수 | 기사 제목 |
| `languageCode` | 필수 | 기사 언어 |
| `publishedAt` | 필수 | 기사 발행 시각 |
| `fetchedAt` | 필수 | 시스템이 기사를 수집한 시각 |
| `authorNames` | 필수 | 작성자 이름 목록, 없으면 빈 배열 |
| `summary` | 선택 | 기사 요약 |
| `bodyText` | 선택 | 정제된 기사 본문 |
| `entityIds` | 필수 | 기사와 관련된 Entity ID 목록 |
| `topicIds` | 필수 | 기사와 관련된 Topic ID 목록 |
| `eventIds` | 필수 | 기사와 연결된 Event ID 목록 |

### 규칙

- `Article` 안에 `Source`, `Entity`, `Topic`, `Event` 객체를 직접 중첩하지 않는다.
- 관계는 반드시 ID 배열로 표현한다.
- 작성자가 없으면 `authorNames`는 `[]`로 저장한다.
- 관련 객체가 아직 없으면 각 ID 배열은 `[]`로 저장한다.

---

## 5. Entity

기사와 사건에 등장하는 사람, 국가, 기업, 정부기관 등의 주체를 나타낸다.

```ts
export type EntityType =
  | "person"
  | "country"
  | "government"
  | "company"
  | "organization"
  | "international_organization"
  | "military_group"
  | "political_party"
  | "location"
  | "other";

export interface Entity {
  id: Id;
  type: EntityType;
  canonicalName: string;

  aliases: string[];
  countryCode?: CountryCode;
  description?: string;
}
```

### 필드 설명

| 필드 | 필수 | 설명 |
|---|---:|---|
| `id` | 필수 | 엔티티 고유 ID |
| `type` | 필수 | 엔티티 유형 |
| `canonicalName` | 필수 | 시스템에서 사용하는 표준 이름 |
| `aliases` | 필수 | 별칭, 약칭 및 다른 표기 |
| `countryCode` | 선택 | 주된 연관 국가 |
| `description` | 선택 | 엔티티 설명 |

### 규칙

- `canonicalName`은 해당 엔티티를 대표하는 하나의 표준 이름이다.
- 별칭이 없으면 `aliases`는 빈 배열이다.
- 같은 실체를 표기만 다르게 하여 여러 Entity로 중복 생성하지 않는다.

---

## 6. Topic

기사를 분류하는 주제 또는 카테고리를 나타낸다.

```ts
export interface Topic {
  id: Id;
  name: string;
  slug: string;

  description?: string;
  parentTopicId?: Id;
}
```

### 필드 설명

| 필드 | 필수 | 설명 |
|---|---:|---|
| `id` | 필수 | 주제 고유 ID |
| `name` | 필수 | 사용자에게 표시할 주제 이름 |
| `slug` | 필수 | URL 및 내부 식별에 사용할 문자열 |
| `description` | 선택 | 주제 설명 |
| `parentTopicId` | 선택 | 상위 Topic의 ID |

### 규칙

- `slug`는 소문자 영문, 숫자 및 하이픈 사용을 권장한다.
- 계층형 주제는 `parentTopicId`로 연결한다.
- 상위 Topic 객체를 직접 중첩하지 않는다.

예시:

```text
geopolitics
middle-east
semiconductors
monetary-policy
```

---

## 7. Event

여러 기사에서 공통으로 보도되는 현실 세계의 사건을 나타낸다.

```ts
export type EventStatus =
  | "reported"
  | "developing"
  | "confirmed"
  | "disputed"
  | "resolved"
  | "archived";

export interface Event {
  id: Id;
  title: string;
  summary: string;

  status: EventStatus;
  confidence: ConfidenceLevel;

  startedAt?: ISODateString;
  endedAt?: ISODateString;

  articleIds: Id[];
  entityIds: Id[];
  topicIds: Id[];
  locationEntityIds: Id[];

  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

### 필드 설명

| 필드 | 필수 | 설명 |
|---|---:|---|
| `id` | 필수 | 사건 고유 ID |
| `title` | 필수 | 사건을 대표하는 제목 |
| `summary` | 필수 | 사건 요약 |
| `status` | 필수 | 사건 진행 상태 |
| `confidence` | 필수 | 사건 식별의 신뢰 수준 |
| `startedAt` | 선택 | 사건 시작 시각 |
| `endedAt` | 선택 | 사건 종료 시각 |
| `articleIds` | 필수 | 사건의 근거가 되는 기사 ID |
| `entityIds` | 필수 | 사건에 참여하거나 영향을 받는 Entity ID |
| `topicIds` | 필수 | 사건과 관련된 Topic ID |
| `locationEntityIds` | 필수 | 장소를 나타내는 Entity ID |
| `createdAt` | 필수 | Event 레코드 생성 시각 |
| `updatedAt` | 필수 | Event 레코드 최종 수정 시각 |

### EventStatus 의미

| 상태 | 의미 |
|---|---|
| `reported` | 최초 보도되었지만 충분히 검증되지 않음 |
| `developing` | 계속 전개되고 있는 사건 |
| `confirmed` | 복수의 신뢰 가능한 출처로 확인됨 |
| `disputed` | 핵심 사실에 대해 출처 간 의견이 충돌함 |
| `resolved` | 사건의 주요 전개가 종료됨 |
| `archived` | 현재 분석 대상에서 제외된 과거 사건 |

### 규칙

- 하나의 기사와 하나의 Event를 동일하게 취급하지 않는다.
- 여러 기사가 같은 사건을 다룰 수 있다.
- `articleIds`에는 해당 사건을 뒷받침하는 기사만 포함한다.
- `endedAt`은 `startedAt`보다 빠를 수 없다.
- 사건의 발생 시각이 알려지지 않았으면 날짜를 추측하지 않고 필드를 생략한다.

---

## 8. Analysis

AI 또는 분석 시스템이 생성한 분석 결과를 나타낸다.

```ts
export type AnalysisTargetType =
  | "article"
  | "event"
  | "entity"
  | "topic";

export type AnalysisKind =
  | "summary"
  | "impact"
  | "relationship"
  | "scenario"
  | "fact_check"
  | "trend";

export interface Analysis {
  id: Id;

  targetType: AnalysisTargetType;
  targetId: Id;
  kind: AnalysisKind;

  title: string;
  summary: string;
  keyPoints: string[];

  confidence: ConfidenceLevel;
  evidenceArticleIds: Id[];
  caveats: string[];

  modelName: string;
  generatedAt: ISODateString;
}
```

### 필드 설명

| 필드 | 필수 | 설명 |
|---|---:|---|
| `id` | 필수 | 분석 결과 고유 ID |
| `targetType` | 필수 | 분석 대상의 도메인 타입 |
| `targetId` | 필수 | 분석 대상 객체의 ID |
| `kind` | 필수 | 분석 종류 |
| `title` | 필수 | 분석 제목 |
| `summary` | 필수 | 분석 결과 요약 |
| `keyPoints` | 필수 | 핵심 분석 내용 |
| `confidence` | 필수 | 분석 결과 신뢰 수준 |
| `evidenceArticleIds` | 필수 | 분석에 사용된 근거 기사 ID |
| `caveats` | 필수 | 불확실성, 한계 및 주의사항 |
| `modelName` | 필수 | 분석을 생성한 모델 또는 시스템 이름 |
| `generatedAt` | 필수 | 분석 생성 시각 |

### 규칙

- 분석 결과는 원문 기사와 분리해서 저장한다.
- AI가 생성한 내용은 원문 사실처럼 취급하지 않는다.
- 근거 기사가 없으면 `evidenceArticleIds`를 빈 배열로 둘 수 있지만, 신뢰도는 일반적으로 `low`여야 한다.
- 불확실성이 없다고 가정하지 않는다.
- 중요한 한계가 있으면 반드시 `caveats`에 기록한다.

---

## 9. 객체 관계

핵심 관계는 다음과 같다.

```text
Source
  └── Article

Article
  ├── Entity
  ├── Topic
  └── Event

Event
  ├── Article
  ├── Entity
  └── Topic

Analysis
  └── Article | Event | Entity | Topic
```

관계는 객체 중첩이 아니라 ID 참조로 구현한다.

올바른 예시:

```ts
interface Article {
  sourceId: Id;
}
```

잘못된 예시:

```ts
interface Article {
  source: Source;
}
```

---

## 10. 필수 필드와 선택 필드

### 필수 필드

필수 필드는 데이터가 존재하지 않더라도 타입에서 제거하지 않는다.

배열 필드에 값이 없으면 빈 배열을 사용한다.

```ts
authorNames: [];
entityIds: [];
topicIds: [];
```

### 선택 필드

실제로 값이 없거나 아직 알 수 없는 경우에만 선택 필드로 둔다.

```ts
description?: string;
startedAt?: ISODateString;
```

다음 방식은 사용하지 않는다.

```ts
description: string | null;
```

Sprint-02에서는 `null`을 도메인 모델의 기본 부재 표현으로 사용하지 않는다.

---

## 11. 파일 구조

Sprint-02에서 다음 구조를 사용한다.

```text
src/
└── domain/
    ├── common.ts
    ├── source.ts
    ├── article.ts
    ├── entity.ts
    ├── topic.ts
    ├── event.ts
    ├── analysis.ts
    └── index.ts
```

### 파일 책임

| 파일 | 책임 |
|---|---|
| `common.ts` | 공통 타입 |
| `source.ts` | Source 관련 타입 |
| `article.ts` | Article 관련 타입 |
| `entity.ts` | Entity 관련 타입 |
| `topic.ts` | Topic 관련 타입 |
| `event.ts` | Event 관련 타입 |
| `analysis.ts` | Analysis 관련 타입 |
| `index.ts` | 모든 공개 도메인 타입 재수출 |

---

## 12. Export 규칙

각 파일은 해당 파일에서 정의한 공개 타입을 export한다.

`src/domain/index.ts`에서는 모든 공개 타입을 다시 export한다.

예시:

```ts
export * from "./common";
export * from "./source";
export * from "./article";
export * from "./entity";
export * from "./topic";
export * from "./event";
export * from "./analysis";
```

외부 코드는 가능한 경우 개별 파일보다 다음 경로에서 가져온다.

```ts
import type { Article, Event, Entity } from "./domain";
```

---

## 13. 금지 사항

Sprint-02에서는 다음을 수행하지 않는다.

- 데이터베이스 스키마 구현
- ORM 모델 구현
- API 요청 및 응답 타입 구현
- 뉴스 크롤러 구현
- AI 분석 로직 구현
- UI 컴포넌트 구현
- 런타임 검증 라이브러리 추가
- 도메인 객체에 메서드 추가
- 문서에 없는 필드 임의 추가
- `any` 사용
- 도메인 객체 직접 중첩

---

## 14. 완료 조건

TypeScript Domain Contract 구현은 다음 조건을 모두 충족해야 완료로 인정한다.

- 모든 공통 타입이 구현되어 있다.
- `Source`, `Article`, `Entity`, `Topic`, `Event`, `Analysis`가 구현되어 있다.
- 모든 enum 성격의 값은 문자열 리터럴 유니언으로 구현되어 있다.
- 객체 관계가 ID 참조로 구현되어 있다.
- 모든 공개 타입이 `src/domain/index.ts`에서 export된다.
- TypeScript strict mode에서 타입 오류가 없다.
- `any`가 사용되지 않았다.
- Sprint 범위를 벗어난 기능이 추가되지 않았다.

---

## 15. 변경 관리

이 계약을 변경하려면 다음 절차를 따른다.

1. Architecture 문서를 먼저 수정한다.
2. 변경 이유를 문서에 기록한다.
3. Sprint 문서를 수정한다.
4. 구현을 변경한다.
5. CHANGELOG에 변경 내용을 기록한다.

Codex는 Architecture 문서를 임의로 변경하지 않는다. 설계 변경이 필요하면 구현을 중단하고 ChatGPT(CTO)에게 보고한다.
