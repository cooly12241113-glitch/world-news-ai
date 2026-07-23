# Runtime Validation Contract

## 문서 상태

- Version: `1.0`
- Status: Approved for Sprint-03
- Scope: Runtime validation and domain contract testing
- Depends on:
  - `docs/architecture/TypeScript-Domain-Contract.md`
  - Sprint-02 core domain types

---

## 1. 목적

이 문서는 World News AI의 런타임 데이터 검증 계층을 정의한다.

Sprint-02에서 구현된 TypeScript 도메인 타입은 컴파일 시점의 계약이다.

Sprint-03에서는 외부에서 들어오는 `unknown` 데이터를 신뢰 가능한 도메인 객체로 전환하기 전에 검증하는 런타임 스키마를 구현한다.

검증 대상에는 앞으로 다음 데이터가 포함될 수 있다.

- 뉴스 API 응답
- 크롤링 결과
- 저장소에서 읽은 JSON
- 사용자 입력
- AI 모델의 구조화된 출력
- 외부 서비스의 Webhook 또는 메시지

Sprint-03은 실제 뉴스 수집이나 AI 호출을 구현하지 않는다.

---

## 2. 핵심 원칙

런타임 검증 계층은 다음 원칙을 따른다.

1. `src/domain`의 타입을 정적 계약의 기준으로 유지한다.
2. 외부 입력은 항상 `unknown`으로 취급한다.
3. 검증에 성공한 값만 도메인 타입으로 사용한다.
4. 알려지지 않은 객체 필드는 거부한다.
5. 자동 형 변환을 수행하지 않는다.
6. 자동 기본값을 삽입하지 않는다.
7. 입력 데이터를 임의로 정규화하지 않는다.
8. `null`을 선택 필드의 부재 표현으로 허용하지 않는다.
9. 도메인 타입과 런타임 스키마의 불일치를 테스트로 방지한다.
10. 검증 계층은 데이터베이스, API 프레임워크 및 UI에 의존하지 않는다.

---

## 3. 기술 결정

### 런타임 검증 라이브러리

다음 패키지를 사용한다.

```text
zod
```

`zod`는 프로덕션 런타임 의존성으로 설치한다.

```json
{
  "dependencies": {
    "zod": "..."
  }
}
```

정확한 패키지 버전은 설치 시점의 안정 버전을 사용하고 `package-lock.json`으로 고정한다.

### 테스트 프레임워크

다음 패키지를 사용한다.

```text
vitest
```

`vitest`는 개발 의존성으로 설치한다.

```json
{
  "devDependencies": {
    "vitest": "..."
  }
}
```

### Node.js 최소 버전

Sprint-03은 다음 환경을 요구한다.

```text
Node.js >= 20
```

Codex는 패키지 설치 전에 다음 명령으로 환경을 확인한다.

```bash
node --version
```

Node.js 버전이 20 미만이면 구현을 중단하고 보고한다.

---

## 4. 도메인 타입과 스키마의 관계

Sprint-02에서 구현한 다음 타입은 계속 유지한다.

```text
Source
Article
Entity
Topic
Event
Analysis
```

런타임 스키마가 도메인 타입을 대체해서는 안 된다.

올바른 구조:

```text
src/domain/
  정적 TypeScript 타입

src/validation/
  런타임 Zod 스키마
```

각 스키마의 출력 타입은 대응하는 도메인 타입과 호환되어야 한다.

예시:

```ts
import * as z from "zod";
import type { Source } from "../domain";

export const SourceSchema: z.ZodType<Source> =
  z.strictObject({
    // fields
  });
```

정확한 Zod 타입 표기가 컴파일러와 충돌하는 경우, 다음과 같은 타입 계약 테스트를 사용할 수 있다.

```ts
expectTypeOf<z.infer<typeof SourceSchema>>()
  .toEqualTypeOf<Source>();
```

Codex는 도메인 타입을 스키마에서 다시 생성하거나 교체하지 않는다.

---

## 5. 검증과 정규화의 분리

Sprint-03은 검증만 담당한다.

다음 자동 변환은 수행하지 않는다.

- 문자열 앞뒤 공백 제거
- 대소문자 변환
- 날짜 문자열 변환
- 숫자를 문자열로 변환
- 문자열을 배열로 변환
- 누락된 배열에 빈 배열 삽입
- 누락된 필드에 기본값 삽입
- URL 정규화
- 별칭 병합
- 중복 엔티티 병합

예를 들어 다음 입력은 거부한다.

```ts
{
  authorNames: undefined
}
```

필수 배열은 입력 데이터에 명시적으로 존재해야 한다.

```ts
{
  authorNames: []
}
```

정규화 계층은 이후 별도의 Sprint에서 설계한다.

---

## 6. 공통 스키마

다음 공통 스키마를 구현한다.

```ts
IdSchema
ISODateStringSchema
URLStringSchema
LanguageCodeSchema
CountryCodeSchema
ConfidenceLevelSchema
NonEmptyStringSchema
UniqueIdArraySchema
```

### `NonEmptyStringSchema`

- 문자열이어야 한다.
- 길이가 1 이상이어야 한다.
- 자동으로 `trim()`하지 않는다.

공백만 있는 문자열을 별도로 거부할 수 있도록 검증을 추가한다.

허용:

```text
World News
```

거부:

```text
""
"   "
```

### `IdSchema`

- 문자열이어야 한다.
- 비어 있지 않아야 한다.
- ID 형식을 UUID로 제한하지 않는다.
- 자동 형 변환을 허용하지 않는다.

### `ISODateStringSchema`

- ISO 8601 datetime 문자열이어야 한다.
- `Z` 또는 명시적 시간대 offset이 있어야 한다.
- 시간대가 없는 local datetime은 거부한다.
- JavaScript `Date` 객체는 허용하지 않는다.

허용:

```text
2026-07-24T01:30:00.000Z
2026-07-24T10:30:00+09:00
```

거부:

```text
2026-07-24
2026-07-24 10:30
2026-07-24T10:30:00
```

### `URLStringSchema`

- `http` 또는 `https` URL만 허용한다.
- 상대 URL은 거부한다.
- `mailto:`, `file:`, `javascript:` 등은 거부한다.
- URL을 자동 정규화하지 않는다.

### `LanguageCodeSchema`

Sprint-03에서는 BCP 47의 실용적 부분집합을 검증한다.

권장 패턴:

```regex
^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$
```

허용 예시:

```text
ko
en
en-US
zh-CN
```

거부 예시:

```text
k
english
en_US
```

### `CountryCodeSchema`

ISO 3166-1 alpha-2 형태를 검증한다.

규칙:

```regex
^[A-Z]{2}$
```

허용:

```text
KR
US
JP
```

거부:

```text
kr
KOR
K
```

Sprint-03에서는 실제 ISO 국가 목록 존재 여부까지 검증하지 않는다.

### `ConfidenceLevelSchema`

다음 값만 허용한다.

```text
low
medium
high
```

### `UniqueIdArraySchema`

- `IdSchema`의 배열이어야 한다.
- 빈 배열을 허용한다.
- 같은 ID의 중복을 허용하지 않는다.
- 배열의 순서는 유지한다.
- 자동으로 중복을 제거하지 않는다.

---

## 7. 객체 검증 정책

모든 도메인 객체 스키마는 strict object여야 한다.

알려지지 않은 필드가 포함되면 검증에 실패한다.

예시:

```ts
SourceSchema.safeParse({
  id: "source-1",
  name: "Example",
  type: "news_outlet",
  homepageUrl: "https://example.com",
  unsupportedField: true,
});
```

위 입력은 `unsupportedField` 때문에 실패해야 한다.

객체의 알려지지 않은 필드를 삭제한 뒤 통과시키는 방식은 사용하지 않는다.

---

## 8. 선택 필드 정책

도메인 계약에서 `?`로 정의된 필드만 생략할 수 있다.

예시:

```ts
description?: string;
```

허용:

```ts
{
  id: "source-1"
}
```

거부:

```ts
{
  id: "source-1",
  description: null
}
```

Sprint-03에서는 선택 필드에 명시적으로 `undefined`를 전달하는 것보다 필드를 생략하는 방식을 권장한다.

---

## 9. SourceSchema

다음 도메인 타입을 검증한다.

```text
Source
SourceType
```

### SourceType 허용값

```text
news_outlet
government
international_organization
research_institution
nonprofit
social_media
other
```

### 필드 규칙

| 필드 | 검증 |
|---|---|
| `id` | `IdSchema` |
| `name` | `NonEmptyStringSchema` |
| `type` | `SourceTypeSchema` |
| `homepageUrl` | `URLStringSchema` |
| `countryCode` | 선택 `CountryCodeSchema` |
| `primaryLanguageCode` | 선택 `LanguageCodeSchema` |
| `description` | 선택 `NonEmptyStringSchema` |

---

## 10. ArticleSchema

다음 도메인 타입을 검증한다.

```text
Article
```

### 필드 규칙

| 필드 | 검증 |
|---|---|
| `id` | `IdSchema` |
| `sourceId` | `IdSchema` |
| `canonicalUrl` | `URLStringSchema` |
| `title` | `NonEmptyStringSchema` |
| `languageCode` | `LanguageCodeSchema` |
| `publishedAt` | `ISODateStringSchema` |
| `fetchedAt` | `ISODateStringSchema` |
| `authorNames` | 고유한 비어 있지 않은 문자열 배열 |
| `summary` | 선택 `NonEmptyStringSchema` |
| `bodyText` | 선택 `NonEmptyStringSchema` |
| `entityIds` | `UniqueIdArraySchema` |
| `topicIds` | `UniqueIdArraySchema` |
| `eventIds` | `UniqueIdArraySchema` |

`fetchedAt`이 `publishedAt`보다 늦어야 한다는 규칙은 Sprint-03에서 강제하지 않는다.

원문 출처의 시간 정보가 부정확하거나 수정 기사일 수 있기 때문이다.

---

## 11. EntitySchema

다음 도메인 타입을 검증한다.

```text
Entity
EntityType
```

### EntityType 허용값

```text
person
country
government
company
organization
international_organization
military_group
political_party
location
other
```

### 필드 규칙

| 필드 | 검증 |
|---|---|
| `id` | `IdSchema` |
| `type` | `EntityTypeSchema` |
| `canonicalName` | `NonEmptyStringSchema` |
| `aliases` | 중복 없는 비어 있지 않은 문자열 배열 |
| `countryCode` | 선택 `CountryCodeSchema` |
| `description` | 선택 `NonEmptyStringSchema` |

`aliases`가 빈 배열인 것은 허용한다.

Sprint-03에서는 대소문자나 다국어 표기까지 고려한 의미적 중복을 판별하지 않는다.

---

## 12. TopicSchema

다음 도메인 타입을 검증한다.

```text
Topic
```

### slug 규칙

`slug`는 다음 형식을 사용한다.

```regex
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

허용:

```text
geopolitics
middle-east
monetary-policy
ai-2026
```

거부:

```text
Middle-East
middle_east
-middle-east
middle-east-
```

### 필드 규칙

| 필드 | 검증 |
|---|---|
| `id` | `IdSchema` |
| `name` | `NonEmptyStringSchema` |
| `slug` | slug 전용 스키마 |
| `description` | 선택 `NonEmptyStringSchema` |
| `parentTopicId` | 선택 `IdSchema` |

### 객체 수준 규칙

다음 입력은 거부한다.

```ts
{
  id: "topic-1",
  parentTopicId: "topic-1"
}
```

Topic은 자기 자신을 상위 Topic으로 참조할 수 없다.

전체 Topic 계층의 순환 참조 검사는 Sprint-03 범위에 포함하지 않는다.

---

## 13. EventSchema

다음 도메인 타입을 검증한다.

```text
Event
EventStatus
```

### EventStatus 허용값

```text
reported
developing
confirmed
disputed
resolved
archived
```

### 필드 규칙

| 필드 | 검증 |
|---|---|
| `id` | `IdSchema` |
| `title` | `NonEmptyStringSchema` |
| `summary` | `NonEmptyStringSchema` |
| `status` | `EventStatusSchema` |
| `confidence` | `ConfidenceLevelSchema` |
| `startedAt` | 선택 `ISODateStringSchema` |
| `endedAt` | 선택 `ISODateStringSchema` |
| `articleIds` | `UniqueIdArraySchema` |
| `entityIds` | `UniqueIdArraySchema` |
| `topicIds` | `UniqueIdArraySchema` |
| `locationEntityIds` | `UniqueIdArraySchema` |
| `createdAt` | `ISODateStringSchema` |
| `updatedAt` | `ISODateStringSchema` |

### 객체 수준 규칙

`startedAt`과 `endedAt`이 모두 존재하면 다음 조건을 만족해야 한다.

```text
endedAt >= startedAt
```

다음 조건도 만족해야 한다.

```text
updatedAt >= createdAt
```

시간 비교는 검증된 ISO datetime을 기준으로 수행한다.

`locationEntityIds`가 반드시 `entityIds`의 부분집합이어야 한다는 규칙은 Sprint-03에서 강제하지 않는다.

---

## 14. AnalysisSchema

다음 도메인 타입을 검증한다.

```text
Analysis
AnalysisTargetType
AnalysisKind
```

### AnalysisTargetType 허용값

```text
article
event
entity
topic
```

### AnalysisKind 허용값

```text
summary
impact
relationship
scenario
fact_check
trend
```

### 필드 규칙

| 필드 | 검증 |
|---|---|
| `id` | `IdSchema` |
| `targetType` | `AnalysisTargetTypeSchema` |
| `targetId` | `IdSchema` |
| `kind` | `AnalysisKindSchema` |
| `title` | `NonEmptyStringSchema` |
| `summary` | `NonEmptyStringSchema` |
| `keyPoints` | 중복 없는 비어 있지 않은 문자열 배열 |
| `confidence` | `ConfidenceLevelSchema` |
| `evidenceArticleIds` | `UniqueIdArraySchema` |
| `caveats` | 중복 없는 비어 있지 않은 문자열 배열 |
| `modelName` | `NonEmptyStringSchema` |
| `generatedAt` | `ISODateStringSchema` |

`keyPoints`, `evidenceArticleIds`, `caveats`는 빈 배열을 허용한다.

근거 기사가 없는 고신뢰도 분석을 스키마 수준에서 거부하지 않는다. 해당 정책은 향후 분석 서비스 계층에서 다룬다.

---

## 15. 공개 API

각 스키마를 공개 export한다.

예시:

```ts
import {
  ArticleSchema,
  EventSchema,
  SourceSchema,
} from "./validation";
```

소비자는 필요에 따라 다음 API를 사용한다.

```ts
const article = ArticleSchema.parse(input);
```

또는:

```ts
const result = ArticleSchema.safeParse(input);
```

Sprint-03에서는 Zod 오류를 별도의 애플리케이션 오류 형식으로 변환하지 않는다.

오류 표준화는 API 또는 수집 파이프라인 설계와 함께 별도 Sprint에서 구현한다.

---

## 16. 파일 구조

Sprint-03에서는 다음 구조를 사용한다.

```text
src/
├── domain/
│   └── 기존 Sprint-02 파일
│
└── validation/
    ├── common.ts
    ├── source.ts
    ├── article.ts
    ├── entity.ts
    ├── topic.ts
    ├── event.ts
    ├── analysis.ts
    ├── index.ts
    │
    └── __tests__/
        ├── fixtures.ts
        ├── common.test.ts
        ├── source.test.ts
        ├── article.test.ts
        ├── entity.test.ts
        ├── topic.test.ts
        ├── event.test.ts
        └── analysis.test.ts
```

### 파일 책임

| 파일 | 책임 |
|---|---|
| `common.ts` | 공통 primitive 및 배열 스키마 |
| `source.ts` | Source 관련 스키마 |
| `article.ts` | Article 스키마 |
| `entity.ts` | Entity 관련 스키마 |
| `topic.ts` | Topic 스키마와 자체 참조 검증 |
| `event.ts` | Event 스키마와 시간 순서 검증 |
| `analysis.ts` | Analysis 관련 스키마 |
| `index.ts` | 모든 공개 검증 스키마 재수출 |
| `fixtures.ts` | 테스트 전용 유효 객체 |
| `*.test.ts` | 유효·무효 입력 및 타입 계약 테스트 |

---

## 17. Export 규칙

`src/validation/index.ts`에서 모든 공개 스키마를 재수출한다.

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

테스트 fixture와 테스트 파일은 export하지 않는다.

---

## 18. 테스트 계약

각 도메인 스키마는 최소한 다음 테스트를 가져야 한다.

### 유효 입력

- 계약에 맞는 완전한 객체가 성공한다.
- 선택 필드가 생략된 최소 객체가 성공한다.
- 빈 배열이 허용된 필드가 성공한다.

### 무효 입력

- 필수 필드 누락이 실패한다.
- 잘못된 primitive 타입이 실패한다.
- 잘못된 enum 값이 실패한다.
- `null`이 실패한다.
- 알려지지 않은 필드가 실패한다.
- 잘못된 URL이 실패한다.
- 잘못된 ISO datetime이 실패한다.
- 중복 ID가 실패한다.
- 공백뿐인 문자열이 실패한다.

### 객체 수준 규칙

- 자기 자신을 참조하는 Topic이 실패한다.
- 시작 시각보다 빠른 종료 시각의 Event가 실패한다.
- 생성 시각보다 빠른 수정 시각의 Event가 실패한다.

### 타입 계약

각 스키마의 추론 결과가 대응하는 도메인 타입과 일치해야 한다.

예시:

```ts
expectTypeOf<z.infer<typeof ArticleSchema>>()
  .toEqualTypeOf<Article>();
```

테스트는 구현 세부사항이 아니라 공개 계약과 관찰 가능한 검증 결과를 확인한다.

---

## 19. package.json 스크립트

다음 스크립트를 제공한다.

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "validate": "npm run typecheck && npm run test"
  }
}
```

기존 `typecheck` 스크립트는 유지한다.

최종 검증은 다음 명령으로 수행한다.

```bash
npm run validate
```

---

## 20. 금지 사항

Sprint-03에서는 다음을 수행하지 않는다.

- 기존 도메인 필드 변경
- 기존 도메인 타입 삭제
- 스키마 추론 타입으로 도메인 타입 대체
- 뉴스 API 연동
- 크롤러 구현
- 기사 정규화
- Entity 병합
- Topic 자동 분류
- AI 모델 호출
- 데이터베이스 구현
- API 서버 구현
- UI 구현
- 오류 메시지 국제화
- JSON Schema 생성
- OpenAPI 생성
- 자동 형 변환
- 자동 기본값 삽입
- `any` 사용
- 외부 입력을 검증 없이 type assertion으로 변환

다음 방식은 금지한다.

```ts
const article = input as Article;
```

---

## 21. 완료 조건

다음 조건을 모두 충족해야 Runtime Validation Contract 구현이 완료된다.

- 모든 공통 스키마가 구현되어 있다.
- 모든 도메인 스키마가 구현되어 있다.
- 모든 enum 성격의 값이 정확히 검증된다.
- 모든 객체 스키마가 알려지지 않은 필드를 거부한다.
- `null`이 선택 필드의 부재 표현으로 허용되지 않는다.
- 자동 coercion, transform, default가 없다.
- ID 배열의 중복이 거부된다.
- Topic 자기 참조가 거부된다.
- Event 시간 순서가 검증된다.
- 도메인 타입과 스키마 출력 타입이 일치한다.
- 모든 공개 스키마가 `src/validation/index.ts`에서 export된다.
- `npm run typecheck`가 통과한다.
- `npm run test`가 통과한다.
- `npm run validate`가 통과한다.
- `any`가 사용되지 않았다.
- Sprint 범위를 벗어난 기능이 추가되지 않았다.

---

## 22. 변경 관리

이 계약을 변경하려면 다음 순서를 따른다.

1. 이 Architecture 문서를 수정한다.
2. 변경 이유를 기록한다.
3. Sprint 문서를 수정한다.
4. 런타임 스키마를 수정한다.
5. 테스트를 수정한다.
6. CHANGELOG를 갱신한다.

Codex는 이 Architecture 문서의 계약을 임의로 변경하지 않는다.

설계와 구현이 충돌하면 구현을 중단하고 ChatGPT(CTO)에게 보고한다.
