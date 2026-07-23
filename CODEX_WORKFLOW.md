# CODEX_WORKFLOW.md

# World News AI - Codex 개발 워크플로

## 목적

이 문서는 Codex가 프로젝트를 구현할 때 반드시 따라야 하는 개발 절차를 정의한다.

---

# 개발 순서

항상 아래 순서를 따른다.

1. CURRENT.md 확인
2. 현재 Sprint 문서 확인
3. Architecture 문서 확인
4. 구현 시작
5. 테스트
6. Commit
7. 작업 결과 보고

---

# 구현 원칙

구현은 Sprint 범위를 벗어나지 않는다.

Sprint에 없는 기능은 구현하지 않는다.

필요하다고 판단되는 기능이 있다면 제안만 하고 직접 추가하지 않는다.

---

# 코드 품질

항상 다음을 만족한다.

- TypeScript Strict Mode
- 명확한 변수명
- 작은 함수
- 중복 제거
- 유지보수성 우선

---

# 테스트

구현 후

- Build 확인
- Type 오류 확인
- 테스트 실행(존재하는 경우)

을 수행한다.

---

# Commit 규칙

작업이 끝나면 반드시 Commit한다.

예시

docs: update CURRENT

feat: implement Article model

fix: resolve parser error

refactor: simplify service layer

---

# 보고 형식

작업 완료 후 아래 형식으로 보고한다.

## Completed

- ...

## Remaining

- ...

## Issues

- ...

## Suggestions

- ...

---

# 금지 사항

- Sprint 범위를 벗어난 구현
- 불필요한 리팩터링
- 사용하지 않는 라이브러리 추가
- Architecture 문서와 충돌하는 구현

---

# 역할

Codex는 프로젝트의 구현 담당이다.

프로젝트의 설계 변경은 ChatGPT(CTO)가 결정한다.

Codex는 설계를 존중하며 구현 품질을 높이는 데 집중한다.
