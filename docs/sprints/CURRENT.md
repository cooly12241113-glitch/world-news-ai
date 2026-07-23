# Current Project Status

## Project

World News AI

---

## Current Sprint

Sprint-03 — Runtime Validation and Contract Tests

**Status:** Ready

---

## Current Phase

Sprint-03 Implementation Ready

---

## Current Objective

Sprint-02에서 구현한 TypeScript 도메인 타입에 대응하는 런타임 검증 계층과 계약 테스트를 구현한다.

외부에서 들어오는 `unknown` 데이터를 Zod 스키마로 검증하고, 검증 스키마와 정적 도메인 타입이 서로 일치하는지 Vitest로 확인한다.

---

## Completed

### Repository and Documentation

- GitHub repository initialized
- `README.md` created
- `AGENTS.md` created
- `CODEX_WORKFLOW.md` created
- Sprint documentation workflow established

### Sprint-02

- Core TypeScript domain types implemented
- Strict TypeScript configuration added
- Type checking passed
- Sprint-02 implementation committed and pushed
- Sprint-02 documentation closeout completed

Implementation commit:

```text
b2f75ba5f62434ec00239e2773c64a3777922a41
```

Closeout commit:

```text
8a7f2d92cf7aa95595b356e23362a51f73a2be0a
```

### Sprint-03 Design

- Runtime Validation Contract created
- Sprint-03 implementation specification created

Architecture document:

```text
docs/architecture/Runtime-Validation-Contract.md
```

Sprint specification:

```text
docs/sprints/Sprint-03.md
```

---

## Next Task

Codex가 Sprint-03 문서와 Architecture 계약을 읽고 다음을 구현한다.

- Zod 기반 공통 검증 스키마
- 모든 도메인 객체 검증 스키마
- Strict object 검증
- 도메인 타입 호환성 테스트
- Vitest 기반 계약 테스트
- `npm run validate` 검증 절차

---

## Implementation Restrictions

Sprint-03에서는 다음을 구현하지 않는다.

- 뉴스 API 연동
- 뉴스 크롤러
- 데이터베이스
- AI 모델 호출
- 데이터 정규화
- 사용자 인터페이스
- 기존 도메인 타입 변경

Codex는 다음 문서를 임의로 수정하지 않는다.

- Architecture documents
- Sprint documents
- `AGENTS.md`
- `CODEX_WORKFLOW.md`
- `docs/CHANGELOG.md`

---

## Required Reading Order

Codex는 구현 전에 다음 문서를 순서대로 읽는다.

1. `AGENTS.md`
2. `CODEX_WORKFLOW.md`
3. `docs/sprints/CURRENT.md`
4. `docs/architecture/TypeScript-Domain-Contract.md`
5. `docs/architecture/Runtime-Validation-Contract.md`
6. `docs/sprints/Sprint-03.md`

---

## Long-Term Goal

AI 기반 세계 뉴스 분석 플랫폼 구축

핵심 기능:

- News Collection
- Article Normalization
- Event Extraction
- Entity Recognition
- Topic Classification
- AI Analysis
- Source and Evidence Tracking
- Timeline Visualization
- Geopolitical and Economic Impact Analysis
