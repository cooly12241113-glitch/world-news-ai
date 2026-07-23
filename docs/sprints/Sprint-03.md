# Sprint-03 — Runtime Validation and Contract Tests

## 상태

- Status: Ready
- Owner: Codex
- Reviewer: ChatGPT
- Architecture:
  - `docs/architecture/TypeScript-Domain-Contract.md`
  - `docs/architecture/Runtime-Validation-Contract.md`
- Depends on:
  - Sprint-02 implementation commit `b2f75ba5f62434ec00239e2773c64a3777922a41`
  - Sprint-02 closeout commit `8a7f2d92cf7aa95595b356e23362a51f73a2be0a`

---

## 1. 목표

Sprint-02에서 정의한 TypeScript 도메인 타입에 대응하는 런타임 검증 계층을 구현한다.

외부에서 들어오는 `unknown` 데이터를 다음 도메인 타입으로 사용하기 전에 Zod 스키마로 검증할 수 있어야 한다.

- `Source`
- `Article`
- `Entity`
- `Topic`
- `Event`
- `Analysis`

또한 런타임 스키마와 정적 도메인 타입 사이의 불일치를 방지하는 계약 테스트를 작성한다.

이번 Sprint에서는 실제 뉴스 수집, API, 데이터베이스, AI 호출 또는 UI를 구현하지 않는다.

---

## 2. 구현 전 확인

Codex는 구현 전에 다음 절차를 순서대로 수행한다.

1. 현재 프로젝트 루트가 `world-news-ai-repo`인지 확인한다.
2. 다음 명령을 실행한다.

```bash
git status --short --branch
git remote -v
git pull --ff-only
node --version
npm --version
```

3. 다음 조건을 확인한다.

- 현재 브랜치가 `main`
- 원격 저장소가 `origin`
- 작업 트리가 clean
- `main`이 `origin/main`과 동기화됨
- Node.js 버전이 20 이상
- Sprint-02 구현 파일이 존재함

4. 다음 문서를 정확히 이 순서로 읽는다.

```text
AGENTS.md
CODEX_WORKFLOW.md
docs/sprints/CURRENT.md
docs/architecture/TypeScript-Domain-Contract.md
docs/architecture/Runtime-Validation-Contract.md
docs/sprints/Sprint-03.md
```

5. 기존 `package.json`, `tsconfig.json`, `src/domain` 구조를 확인한다.

문서, 코드 또는 설정이 서로 충돌하면 구현하지 말고 중단 보고서를 작성한다.

---

## 3. 기술 스택

### 런타임 검증

```text
zod
```

`zod`는 프로덕션 의존성으로 설치한다.

### 테스트

```text
vitest
```

`vitest`는 개발 의존성으로 설치한다.

### 패키지 관리자

현재 저장소에서 사용 중인 npm과 `package-lock.json`을 유지한다.

다른 패키지 관리자를 도입하지 않는다.

---

## 4. 구현 범위

다음 공통 검증 스키마를 구현한다.

```text
NonEmptyStringSchema
IdSchema
ISODateStringSchema
URLStringSchema
LanguageCodeSchema
CountryCodeSchema
ConfidenceLevelSchema
UniqueIdArraySchema
```

다음 리터럴 유니언 검증 스키마를 구현한다.

```text
SourceTypeSchema
EntityTypeSchema
EventStatusSchema
AnalysisTargetTypeSchema
AnalysisKindSchema
```

다음 도메인 객체 스키마를 구현한다.

```text
SourceSchema
ArticleSchema
EntitySchema
TopicSchema
EventSchema
AnalysisSchema
```

---

## 5. 생성할 파일

```text
src/
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

필요한 경우 다음 기존 파일만 최소한으로 수정할 수 있다.

```text
package.json
package-lock.json
tsconfig.json
```

그 외 기존 파일은 수정하지 않는다.

---

## 6. 공통 검증 규칙

### NonEmptyStringSchema

다음 조건을 모두 만족해야 한다.

- 문자열이어야 한다.
- 빈 문자열을 거부한다.
- 공백만 있는 문자열을 거부한다.
- 입력값을 자동으로 `trim()`하지 않는다.
- 문자열을 다른 값으로 변환하지 않는다.

허용:

```text
World News
```

거부:

```text
""
"   "
```

### IdSchema

- `NonEmptyStringSchema`의 조건을 따른다.
- UUID 형식으로 제한하지 않는다.
- 숫자나 다른 타입을 문자열로 변환하지 않는다.

### ISODateStringSchema

다음을 허용한다.

```text
2026-07-24T01:30:00.000Z
2026-07-24T10:30:00+09:00
```

다음을 거부한다.

```text
2026-07-24
2026-07-24 10:30
2026-07-24T10:30:00
```

규칙:

- ISO 8601 datetime 문자열이어야 한다.
- `Z` 또는 명시적 timezone offset이 있어야 한다.
- JavaScript `Date` 객체를 허용하지 않는다.
- 날짜를 자동 변환하지 않는다.

### URLStringSchema

- 절대 URL이어야 한다.
- `http` 또는 `https` 프로토콜만 허용한다.
- 상대 URL을 거부한다.
- 다른 프로토콜을 거부한다.

거부 대상 예시:

```text
/path/article
mailto:test@example.com
file:///example
javascript:alert(1)
```

### LanguageCodeSchema

다음 정규식 규칙을 적용한다.

```regex
^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$
```

허용:

```text
ko
en
en-US
zh-CN
```

거부:

```text
k
english
en_US
```

### CountryCodeSchema

다음 정규식 규칙을 적용한다.

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

### ConfidenceLevelSchema

다음 값만 허용한다.

```text
low
medium
high
```

### UniqueIdArraySchema

- `IdSchema` 값으로 구성된 배열이어야 한다.
- 빈 배열을 허용한다.
- 중복 ID를 거부한다.
- 중복 ID를 자동으로 제거하지 않는다.
- 배열 순서를 변경하지 않는다.

---

## 7. 객체 검증 정책

모든 도메인 객체 스키마는 strict object로 구현한다.

문서에 정의되지 않은 필드가 포함되면 검증에 실패해야 한다.

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

위 입력은 실패해야 한다.

알려지지 않은 필드를 자동으로 삭제한 뒤 검증을 통과시키는 방식은 금지한다.

---

## 8. 선택 필드와 null 정책

도메인 계약에서 선택 필드로 정의된 필드만 생략할 수 있다.

허용:

```ts
{
  id: "source-1",
  name: "Example",
  type: "news_outlet",
  homepageUrl: "https://example.com"
}
```

거부:

```ts
{
  id: "source-1",
  name: "Example",
  type: "news_outlet",
  homepageUrl: "https://example.com",
  description: null
}
```

규칙:

- `null`을 값 부재 표현으로 허용하지 않는다.
- 기본값을 자동으로 삽입하지 않는다.
- 필수 배열 필드가 누락되면 실패해야 한다.
- 빈 배열이 허용된 필드는 명시적으로 `[]`를 제공해야 한다.

---

## 9. SourceSchema

다음 `SourceType` 값만 허용한다.

```text
news_outlet
government
international_organization
research_institution
nonprofit
social_media
other
```

필드 계약:

| 필드 | 스키마 |
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

필드 계약:

| 필드 | 스키마 |
|---|---|
| `id` | `IdSchema` |
| `sourceId` | `IdSchema` |
| `canonicalUrl` | `URLStringSchema` |
| `title` | `NonEmptyStringSchema` |
| `languageCode` | `LanguageCodeSchema` |
| `publishedAt` | `ISODateStringSchema` |
| `fetchedAt` | `ISODateStringSchema` |
| `authorNames` | 중복 없는 비어 있지 않은 문자열 배열 |
| `summary` | 선택 `NonEmptyStringSchema` |
| `bodyText` | 선택 `NonEmptyStringSchema` |
| `entityIds` | `UniqueIdArraySchema` |
| `topicIds` | `UniqueIdArraySchema` |
| `eventIds` | `UniqueIdArraySchema` |

`publishedAt`과 `fetchedAt`의 시간 순서는 이번 Sprint에서 비교하지 않는다.

---

## 11. EntitySchema

다음 `EntityType` 값만 허용한다.

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

필드 계약:

| 필드 | 스키마 |
|---|---|
| `id` | `IdSchema` |
| `type` | `EntityTypeSchema` |
| `canonicalName` | `NonEmptyStringSchema` |
| `aliases` | 중복 없는 비어 있지 않은 문자열 배열 |
| `countryCode` | 선택 `CountryCodeSchema` |
| `description` | 선택 `NonEmptyStringSchema` |

`aliases`는 빈 배열을 허용한다.

---

## 12. TopicSchema

`slug`는 다음 규칙을 적용한다.

```regex
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

필드 계약:

| 필드 | 스키마 |
|---|---|
| `id` | `IdSchema` |
| `name` | `NonEmptyStringSchema` |
| `slug` | slug 전용 문자열 스키마 |
| `description` | 선택 `NonEmptyStringSchema` |
| `parentTopicId` | 선택 `IdSchema` |

다음 자기 참조는 거부한다.

```ts
{
  id: "topic-1",
  parentTopicId: "topic-1"
}
```

전체 Topic 계층의 순환 참조 검사는 이번 Sprint에 포함하지 않는다.

---

## 13. EventSchema

다음 `EventStatus` 값만 허용한다.

```text
reported
developing
confirmed
disputed
resolved
archived
```

필드 계약:

| 필드 | 스키마 |
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

객체 수준 규칙:

```text
endedAt >= startedAt
updatedAt >= createdAt
```

해당 필드가 모두 존재할 때만 시간 순서를 검증한다.

---

## 14. AnalysisSchema

다음 `AnalysisTargetType` 값만 허용한다.

```text
article
event
entity
topic
```

다음 `AnalysisKind` 값만 허용한다.

```text
summary
impact
relationship
scenario
fact_check
trend
```

필드 계약:

| 필드 | 스키마 |
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

다음 배열은 빈 배열을 허용한다.

```text
keyPoints
evidenceArticleIds
caveats
```

---

## 15. 도메인 타입 호환성

런타임 스키마는 `src/domain` 타입을 대체하지 않는다.

각 스키마의 추론 출력은 대응하는 도메인 타입과 일치해야 한다.

예시:

```ts
expectTypeOf<z.infer<typeof SourceSchema>>()
  .toEqualTypeOf<Source>();
```

다음 타입 계약을 검사한다.

```text
SourceSchema → Source
ArticleSchema → Article
EntitySchema → Entity
TopicSchema → Topic
EventSchema → Event
AnalysisSchema → Analysis
```

도메인 타입을 수정하여 스키마에 맞추는 것은 금지한다.

스키마가 기존 도메인 계약과 맞아야 한다.

---

## 16. Export 규칙

다음 경로에서 모든 공개 스키마를 가져올 수 있어야 한다.

```ts
import {
  AnalysisSchema,
  ArticleSchema,
  EntitySchema,
  EventSchema,
  SourceSchema,
  TopicSchema,
} from "./validation";
```

`src/validation/index.ts`에서 다음 모듈을 재수출한다.

```ts
export * from "./common";
export * from "./source";
export * from "./article";
export * from "./entity";
export * from "./topic";
export * from "./event";
export * from "./analysis";
```

테스트 fixture와 테스트 파일은 재수출하지 않는다.

내부 구현용 helper는 필요할 경우 사용할 수 있지만 공개 barrel export에 추가하지 않는다.

---

## 17. 테스트 요구사항

각 도메인 스키마 테스트는 최소한 다음 항목을 포함한다.

### 유효 입력

- 모든 필드를 포함한 완전한 객체
- 선택 필드를 생략한 최소 객체
- 허용된 빈 배열
- 허용된 enum 값
- 유효한 ISO datetime
- 유효한 HTTP 또는 HTTPS URL

### 무효 입력

- 필수 필드 누락
- 잘못된 primitive 타입
- 잘못된 enum 값
- `null`
- 알려지지 않은 필드
- 빈 문자열
- 공백만 있는 문자열
- 잘못된 URL
- timezone 없는 datetime
- 중복 ID
- 중복 문자열 배열 값

### 객체 수준 규칙

다음 사례를 반드시 테스트한다.

- Topic의 자기 자신 참조
- Event의 `endedAt < startedAt`
- Event의 `updatedAt < createdAt`

### 타입 계약

각 객체 스키마의 추론 출력과 도메인 타입이 일치하는지 검사한다.

테스트는 구현 내부 구조가 아니라 공개 검증 결과를 확인해야 한다.

---

## 18. Test Fixture 규칙

`fixtures.ts`에는 각 도메인 객체의 유효한 기본 fixture를 둔다.

Fixture는 다음 조건을 만족해야 한다.

- 실제 프로덕션 코드에서 import하지 않는다.
- 테스트 파일에서만 사용한다.
- 각 테스트가 입력 객체를 안전하게 복사하여 변경할 수 있어야 한다.
- fixture 간에 불필요한 상태 공유를 만들지 않는다.

---

## 19. package.json 변경

기존 `typecheck` 스크립트는 유지한다.

다음 스크립트를 추가한다.

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

기존 스크립트가 존재하면 삭제하거나 의미를 변경하지 않는다.

---

## 20. 구현 금지 사항

이번 Sprint에서는 다음을 구현하지 않는다.

- `src/domain` 타입 변경
- 기존 도메인 필드 추가 또는 삭제
- 데이터 정규화
- 자동 `trim`
- 자동 대소문자 변환
- 자동 날짜 변환
- 자동 기본값 삽입
- 자동 중복 제거
- 타입 coercion
- 뉴스 API 연동
- 뉴스 크롤러
- 데이터베이스
- ORM
- REST API
- GraphQL
- AI 모델 호출
- 프롬프트 설계
- UI 컴포넌트
- 오류 국제화
- JSON Schema 생성
- OpenAPI 생성
- 테스트 커버리지 도구 추가
- 관련 없는 라이브러리 추가
- `any` 사용
- 검증되지 않은 type assertion 사용

다음 방식은 금지한다.

```ts
const article = input as Article;
```

---

## 21. 허용되는 수정

다음 변경만 허용한다.

- `src/validation` 생성
- `zod` 설치
- `vitest` 설치
- 테스트 및 fixture 생성
- `package.json` 스크립트 수정
- `package-lock.json` 갱신
- 테스트 또는 TypeScript 실행에 필요한 최소 `tsconfig.json` 수정

기존 도메인 코드와 프로젝트 문서는 수정하지 않는다.

---

## 22. 검증 절차

구현 후 다음 명령을 실행한다.

```bash
npm run typecheck
npm run test
npm run validate
```

추가 검증:

```bash
git diff --check
```

다음 항목도 확인한다.

- `any` 사용 여부
- `null` 스키마 허용 여부
- `.default()` 사용 여부
- `.transform()` 사용 여부
- coercion 사용 여부
- strict object 적용 여부
- 모든 공개 스키마의 barrel export
- 문서에 없는 파일 변경 여부

---

## 23. 중단 조건

다음 상황에서는 구현을 중단하고 보고한다.

- Node.js 버전이 20 미만
- Architecture 문서 간 충돌
- Architecture 문서와 Sprint 문서 간 충돌
- 기존 도메인 타입과 검증 계약이 호환되지 않음
- 기존 설정을 손상하지 않고 테스트 환경을 구성할 수 없음
- 요구된 스키마 타입 호환성을 안전하게 달성할 수 없음
- 구현을 위해 Sprint 범위 밖 변경이 필요함
- 패키지 설치 또는 검증이 반복적으로 실패함

중단 보고에는 다음 내용을 포함한다.

```text
문제
영향받는 파일
실패한 명령
구현을 중단한 이유
가능한 해결 방법
```

Codex는 설계를 임의로 변경하지 않는다.

---

## 24. 완료 조건

다음 조건을 모두 충족해야 Sprint-03이 완료된다.

- [ ] Node.js 20 이상 환경 확인
- [ ] `zod` 설치
- [ ] `vitest` 설치
- [ ] `src/validation/common.ts` 구현
- [ ] `src/validation/source.ts` 구현
- [ ] `src/validation/article.ts` 구현
- [ ] `src/validation/entity.ts` 구현
- [ ] `src/validation/topic.ts` 구현
- [ ] `src/validation/event.ts` 구현
- [ ] `src/validation/analysis.ts` 구현
- [ ] `src/validation/index.ts` 구현
- [ ] 모든 요구 테스트 파일 구현
- [ ] 모든 객체 스키마가 알려지지 않은 필드를 거부
- [ ] 잘못된 URL 및 datetime 거부
- [ ] 중복 ID 및 중복 문자열 값 거부
- [ ] Topic 자기 참조 거부
- [ ] Event 시간 순서 검증
- [ ] 도메인 타입과 스키마 출력 타입 일치
- [ ] `npm run typecheck` 통과
- [ ] `npm run test` 통과
- [ ] `npm run validate` 통과
- [ ] `git diff --check` 통과
- [ ] `any` 미사용
- [ ] 자동 coercion, transform, default 미사용
- [ ] Sprint 범위 밖 변경 없음
- [ ] 완료 보고서 작성

---

## 25. 커밋 규칙

구현과 검증이 모두 성공하면 다음 커밋 메시지를 사용한다.

```text
feat: implement runtime domain validation
```

가능하면 Sprint-03 구현을 하나의 집중된 커밋으로 유지한다.

Codex는 GitHub 인증이 이미 구성되어 있고 안전하게 푸시할 수 있는 경우에만 `origin/main`으로 푸시한다.

---

## 26. 완료 보고 형식

Codex는 작업 완료 후 다음 형식으로 보고한다.

```markdown
## Sprint-03 Completion Report

### Environment

- Project root
- Branch
- Node.js version
- npm version

### Completed

- 구현한 공통 스키마
- 구현한 도메인 스키마
- 작성한 테스트
- 변경한 설정

### Validation

- 실행한 명령
- 각 명령의 결과
- 테스트 파일 수
- 통과한 테스트 수

### Files Changed

- 파일별 변경 내용

### Contract Check

- 도메인 타입 호환성
- strict object 적용 여부
- null 거부 여부
- coercion, transform, default 미사용 여부
- any 미사용 여부

### Remaining

- 남은 작업
- 없다면 `None`

### Issues

- 발생한 문제
- 없다면 `None`

### Scope Check

- Sprint 범위를 벗어난 변경 여부

### Git Status

- 브랜치
- 커밋 생성 여부
- 커밋 해시
- 푸시 여부
- 최종 작업 트리 상태
```
