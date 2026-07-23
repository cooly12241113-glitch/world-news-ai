# Sprint-02 — Core Domain Types

## 상태

- Status: Complete
- Owner: Codex
- Reviewer: ChatGPT
- Implementation Commit:
  `b2f75ba5f62434ec00239e2773c64a3777922a41`
- Architecture:
  `docs/architecture/TypeScript-Domain-Contract.md`

---

## 1. 목표

World News AI의 핵심 도메인 계약을 TypeScript 타입으로 구현한다.

이번 Sprint는 뉴스 수집, AI 분석, 데이터베이스 또는 UI 기능을 만드는 단계가 아니다.

이번 Sprint의 목적은 이후 기능들이 공통으로 사용할 안정적인 도메인 타입 계층을 만드는 것이다.

---

## 2. 사전 확인

Codex는 구현 전에 다음 문서를 순서대로 읽어야 한다.

1. `AGENTS.md`
2. `CODEX_WORKFLOW.md`
3. `docs/sprints/CURRENT.md`
4. `docs/architecture/TypeScript-Domain-Contract.md`
5. 이 문서

문서 사이에 충돌이 있으면 구현을 시작하지 말고 충돌 내용을 보고한다.

---

## 3. 구현 범위

다음 공통 타입을 구현한다.

- `Id`
- `ISODateString`
- `URLString`
- `LanguageCode`
- `CountryCode`
- `ConfidenceLevel`

다음 도메인 타입을 구현한다.

- `Source`
- `Article`
- `Entity`
- `Topic`
- `Event`
- `Analysis`

관련 문자열 리터럴 유니언 타입도 함께 구현한다.

- `SourceType`
- `EntityType`
- `EventStatus`
- `AnalysisTargetType`
- `AnalysisKind`

---

## 4. 생성 또는 수정할 파일

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

필요한 경우에만 다음 프로젝트 설정 파일을 생성하거나 최소한으로 수정할 수 있다.

```text
package.json
tsconfig.json
```

기존 설정이 존재하면 삭제하거나 임의로 교체하지 않는다.

---

## 5. 구현 기준

모든 타입과 필드는 다음 문서를 그대로 따라야 한다.

```text
docs/architecture/TypeScript-Domain-Contract.md
```

Codex는 다음 행동을 해서는 안 된다.

- 문서에 없는 필드 추가
- 필드 이름 변경
- 필수 필드를 선택 필드로 변경
- 선택 필드를 필수 필드로 변경
- 문자열 리터럴 값 변경
- 객체 관계를 중첩 객체로 구현
- 임의의 기본값 도입
- `null`을 기본적인 값 부재 표현으로 사용
- `any` 사용

---

## 6. TypeScript 규칙

다음 조건을 충족해야 한다.

- TypeScript strict mode 사용
- 모든 공개 타입을 명시적으로 export
- 타입 전용 import에는 가능한 경우 `import type` 사용
- 순환 의존성 방지
- 도메인 타입에 실행 로직이나 메서드 추가 금지
- 프레임워크 및 데이터베이스에 독립적이어야 함
- JSON 직렬화 가능한 구조 유지

---

## 7. Export 규칙

`src/domain/index.ts`는 모든 공개 도메인 타입을 재수출해야 한다.

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

외부 코드가 다음과 같이 가져올 수 있어야 한다.

```ts
import type {
  Analysis,
  Article,
  Entity,
  Event,
  Source,
  Topic,
} from "./domain";
```

---

## 8. 프로젝트 설정

### 기존 TypeScript 프로젝트가 있는 경우

- 기존 패키지 관리자와 설정을 유지한다.
- 기존 스크립트와 구조를 최대한 보존한다.
- 이번 Sprint에 필요한 최소 변경만 한다.

### TypeScript 프로젝트가 없는 경우

다음 조건을 만족하는 최소 설정을 만든다.

- TypeScript 개발 의존성 추가
- strict mode 활성화
- `src` 디렉터리 포함
- `noEmit` 기반 타입 검사 가능
- `typecheck` 스크립트 제공

권장 스크립트:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

불필요한 프레임워크나 라이브러리는 설치하지 않는다.

---

## 9. 검증

구현 후 다음 검증을 수행한다.

### 필수 검증

```text
TypeScript typecheck
```

프로젝트에 정의된 명령을 우선 사용한다.

예시:

```bash
npm run typecheck
```

또는 기존 프로젝트의 패키지 관리자에 맞는 명령을 사용한다.

### 추가 확인

- 모든 요구 파일이 존재하는가
- 모든 타입이 계약 문서와 일치하는가
- `src/domain/index.ts`가 모든 공개 타입을 export하는가
- `any`가 사용되지 않았는가
- 불필요한 런타임 코드가 없는가
- Sprint 범위를 벗어난 변경이 없는가

---

## 10. 범위 제외

이번 Sprint에서는 다음을 구현하지 않는다.

- 뉴스 API 연동
- 뉴스 크롤링
- 기사 파싱
- 데이터베이스
- ORM
- REST 또는 GraphQL API
- React 컴포넌트
- 페이지 또는 화면
- AI 모델 호출
- 프롬프트 설계
- 런타임 데이터 검증
- 테스트 데이터 생성
- 인증 및 사용자 계정
- 배포 설정

---

## 11. 중단 조건

다음 상황에서는 임의로 판단하지 말고 작업을 중단한 뒤 보고한다.

- Architecture 문서가 서로 충돌함
- 기존 코드 구조와 Sprint 요구사항이 직접 충돌함
- 기존 설정을 손상하지 않고 구현할 수 없음
- 필수 기술 선택이 문서에 정의되어 있지 않음
- Sprint 범위를 넘어서는 변경이 필요함
- 검증 명령이 반복해서 실패하고 원인이 설계 문제로 판단됨

보고에는 다음 내용을 포함한다.

- 발견한 문제
- 영향을 받는 파일
- 구현이 중단된 이유
- 가능한 해결 선택지

---

## 12. 완료 조건

다음 조건을 모두 충족해야 Sprint-02가 완료된다.

- [x] `src/domain/common.ts` 구현
- [x] `src/domain/source.ts` 구현
- [x] `src/domain/article.ts` 구현
- [x] `src/domain/entity.ts` 구현
- [x] `src/domain/topic.ts` 구현
- [x] `src/domain/event.ts` 구현
- [x] `src/domain/analysis.ts` 구현
- [x] `src/domain/index.ts` 구현
- [x] Architecture 문서와 모든 필드가 일치
- [x] 문자열 리터럴 유니언 타입이 모두 구현됨
- [x] 모든 객체 관계가 ID 참조로 구현됨
- [x] TypeScript strict typecheck 통과
- [x] `any` 미사용
- [x] 범위 밖 기능 미구현
- [x] 완료 보고서 작성

---

## 13. 완료 보고 형식

Codex는 구현이 끝나면 다음 형식으로 보고한다.

```markdown
## Sprint-02 Completion Report

### Completed

- 생성한 파일
- 구현한 타입
- 수정한 설정

### Validation

- 실행한 명령
- 각 명령의 결과

### Files Changed

- 파일별 변경 내용

### Remaining

- 남은 작업
- 없다면 `None`

### Issues

- 발견된 문제
- 없다면 `None`

### Scope Check

- Sprint 범위를 벗어난 변경 여부
```

---

## 14. 커밋 규칙

구현이 정상적으로 완료된 경우 권장 커밋 메시지는 다음과 같다.

```text
feat: implement core domain types
```

설정 파일 생성이 별도 커밋으로 필요한 경우:

```text
chore: configure TypeScript type checking
```

가능하면 Sprint의 구현 변경은 하나의 집중된 커밋으로 유지한다.
