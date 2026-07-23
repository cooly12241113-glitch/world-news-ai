# AGENTS.md

# World News AI - Agent Guide

## Project Overview

World News AI is an AI-powered world news analysis platform.

The purpose of this project is to collect worldwide news, organize events, analyze geopolitical and economic impacts, and provide AI-generated insights.

This repository is developed using a role-based workflow.

---

# Roles

## ChatGPT (CTO)

Responsibilities:

- Define project architecture
- Design system components
- Create Sprint documents
- Review implementation
- Make technical decisions
- Approve completed work

ChatGPT is responsible for **what should be built**, not directly implementing every feature.

---

## Codex (Developer)

Responsibilities:

- Implement Sprint requirements
- Write production-quality code
- Refactor when necessary
- Add tests where appropriate
- Keep codebase clean
- Follow project documentation

Codex is responsible for **how the system is implemented**.

---

# Source of Truth

The following documents define the project.

Priority (highest first)

1. Sprint document
2. CURRENT.md
3. Architecture documents
4. This AGENTS.md
5. README.md

If documents conflict, follow the higher priority document.

---

# Development Principles

Always prefer

- readability
- maintainability
- simplicity

Avoid

- unnecessary abstraction
- premature optimization
- duplicated code

---

# Code Style

General rules

- TypeScript first
- Strict typing
- Small functions
- Clear naming
- Self-documenting code

Avoid

- magic numbers
- deep nesting
- overly clever code

---

# Git Rules

Every meaningful change should be committed.

Use conventional commit messages.

Examples

docs: update AGENTS

feat: implement event model

fix: resolve parser bug

refactor: simplify article service

---

# Sprint Workflow

Before implementation

1. Read CURRENT.md
2. Read Sprint document
3. Read architecture documents

Implementation

- Complete tasks in order
- Keep changes focused
- Avoid unrelated edits

After implementation

- Verify project builds
- Run tests if available
- Commit changes
- Write completion summary

---

# Communication

When reporting progress

Include

- Completed work
- Remaining work
- Problems encountered
- Suggestions (optional)

---

# Project Goal

The long-term goal is to build a maintainable AI platform capable of:

- collecting news
- extracting events
- analyzing entities
- generating AI insights
- visualizing geopolitical trends

Every implementation should contribute toward this goal.
