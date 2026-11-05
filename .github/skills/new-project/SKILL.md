---
name: new-project
description: Build a new production-grade project from scratch with the agent team - requirements, architecture and stack, walking skeleton, tests, security review, CI/CD. Use when the user wants to start a new product, service, or app.
argument-hint: Describe the product idea, users, and any constraints (stack, hosting, budget, deadline)
---

# New project workflow

You are coordinating. Delegate each step to the named agent as a subagent with a self-contained
brief (goal, context, constraints, allowed actions, inputs, definition of done, "## Report").
Only you talk to the user.

## 1. Requirements — Product Analyst (read-only)
Brief: the user's idea and constraints verbatim. Expect users/roles, journeys, business rules,
MVP scope, non-functional requirements, Given/When/Then acceptance criteria, open questions.
Then ask the user the open questions in one batch, with recommended defaults.

## 2. Architecture — Software Architect (read-only)
Brief: the confirmed requirements. Ask for stack options with trade-offs, a recommended stack with
verified current versions, structure, data model, API contracts, auth model, config/secrets,
testing strategy, observability, CI/CD and environments, ADRs, and ordered steps starting with a
walking skeleton. Then present the key decisions to the user and get approval.

## 3. Foundations — you (or Senior Implementation Engineer)
Ask the user before initializing version control (recommend it). Create the project context file
via the `project-discovery` template, filled from the approved plan.

## 4. Walking skeleton — Senior Implementation Engineer
Brief: the approved plan's first milestone. Definition of done: project scaffolded with official
tooling; one thin end-to-end path works; config via env with `.env.example`; `.gitignore`;
lint/format/type-check configured; README with exact commands; every command verified.

## 5. Tests — QA Engineer
Brief: acceptance criteria for the skeleton plus the testing strategy. Expect test setup at the
planned levels, isolated test data, a traceability table, and a passing suite.

## 6. Review — Principal Code Reviewer and Security Engineer (in parallel, read-only)
Then fix loop: send confirmed High+ review and Medium+ security findings to Senior Implementation
Engineer; re-review once. Max 2 rounds.

## 7. Delivery — DevOps Engineer
Brief: CI (lint, type check, tests with real service containers), container image(s), local
Compose, and environment/secret documentation. Then a quick Security Engineer pass on infra.

## 8. Iterate features
For each remaining MVP feature, use the `ship-feature` workflow.

## Close
Re-run the verification commands yourself. Update the project context file. Report outcome, what
each agent did, decisions, validation, risks, and next steps. Offer an SDE Mentor walkthrough.
