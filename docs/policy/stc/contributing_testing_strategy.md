# Testing Strategy

The project uses **several types of tests**, each serving a specific purpose.
It’s important to understand **when to write which test** so that tests remain fast, useful, and maintainable.

Here is the list of commands for test running
```bash

# run unit tests (pure logic, no external services)
npm run test:unit

# run regular end-to-end tests (internal components only, no secrets)
npm run test:e2e

# run scenario tests in smokecheck mode (fast sanity check)
npm run test:scenario:smoke

# run all default (non-gated) tests: unit + regular e2e
npm run test

# run ALL integration tests (unit + e2e + scenario)
# requires secrets and usually CI approval (gated)
npm run test:integration

# run unit-style integration tests (real external services)
npm run test:unit:integration

# run end-to-end integration tests (real app flow + external services)
npm run test:e2e:integration

# run scenario integration tests (user flows with external services)
npm run test:scenario:integration

# run scenario tests in user-like mode with video recording
npm run test:scenario:userlike

# run web scenario tests in user-like mode
npm run test:scenario:userlike:web

# run web scenario tests in user-like mode with mobile viewport
npm run test:scenario:userlike:web:mobile

```

## 1. Unit tests

**Location:**

```
tests/unit/**/*.test.ts
```

**Purpose:**
Unit tests verify **isolated logic** without external dependencies
(browser, CLI, file system, network, external services).

**When to write:**

* new complex business logic
* algorithms, parsing, validations
* edge cases and boundary conditions
* bugs that can be reproduced without an environment

**Characteristics:**

* very fast
* many assertions
* deterministic
* do not use `userSleep`
* do not record video
* **must not call real external services**

**Run commands:**

* `test:unit`

---

## 2. Regular E2E tests

**Location:**

```
tests/e2e/**/*.e2e.test.ts
```

**Purpose:**
Validation of **end-to-end interaction between internal components**
(API, server, browser, CLI),
**without real external services or secrets**.

These tests verify that the system works correctly as a whole,
but still remain fast and deterministic.

**When to write:**

* verifying interaction of multiple internal components
* critical internal flows (API → UI, CLI → FS)
* technical end-to-end checks

**Characteristics:**

* slower than unit tests
* no artificial delays
* no video recording
* no real external APIs

**Run commands:**

* `test:e2e`

---

## 3. Integration tests (external services)

Integration tests validate **real integrations with external services**
(AI providers, GitHub, Jira, etc.) using **real credentials**.

They are used when mocking is insufficient or unreliable.

---

### 3.1 Unit-style integration tests

**Location:**

```
tests/unit/integration/**/*.test.ts
```

**Purpose:**
Tests that look like unit tests in structure,
but **call real external services**.

**Examples:**

* OpenAI / Cursor agent calls
* GitHub or Jira API interactions
* auth, scopes, request formatting
* API contract validation

**Characteristics:**

* slower than pure unit tests
* require network access and secrets
* limited assertions (focus on behavior)
* **never run in default PR checks for untrusted contributors**
* executed in a **separate CI job**

**Run commands:**

* `test:unit:integration`

---

### 3.2 E2E integration tests

**Location:**

```
tests/e2e/integration/**/*.e2e.test.ts
```

**Purpose:**
End-to-end tests that combine:

* real application flow
* real external services

These tests validate **production-like behavior** across system boundaries.

**Examples:**

* user flow triggering an AI agent
* CLI command creating a real GitHub issue
* web flow syncing data with Jira

**Characteristics:**

* slowest tests in the project
* require secrets and external accounts
* minimal retries
* run only in **gated CI jobs**

**Run commands:**

* `test:e2e:integration`

---

## 4. Scenario tests (CLI + Web)

**Location:**

```
tests/scenario/cli/**/*.scenario.test.ts
tests/scenario/web/**/*.scenario.test.ts
```

Scenario tests are a **comprehensive check of a single user feature**
(one test = one user flow).

They complement unit and e2e tests and focus on **feature-level confidence**.

Scenario tests can run in two modes:

* `smokecheck`
* `userlike`

---

### 4.1 Scenario tests — Smokecheck mode

**Command:**

```bash
test:scenario:smoke
```

**Purpose:**
A fast and reliable **sanity check** of key user scenarios.

**Rules:**

* tests run strictly sequentially
* fail-fast (stop on first failure)
* minimal console output
* detailed logs stored in `.cache/smokecheck/*.log`
* `userSleep()` is always `0ms`

**Console output:**

When all tests succeed:

```
passed X/Y in Zs
```

When at least one test fails:

```
passed X/Y in Zs
FAILED: <file> :: <test name>
log: .cache/smokecheck/<file>.log
```

---

### 4.2 Scenario tests — User-like mode (with video)

**Commands:**

```bash
test:scenario:userlike
test:scenario:userlike:web
test:scenario:userlike:web:mobile
```

**Purpose:**
Demonstrational runs intended for **human verification and review**.

**Characteristics:**

* explicit pauses via `userSleep`
* CLI:

  * character-by-character input
  * delays between actions
  * asciinema video recording
* Web:

  * Playwright video recording
* Mobile:

  * forced mobile viewport

**Artifacts:**

* Web:

  ```
  artifacts/user-style-e2e/web/<scenario>/*.webm
  ```
* CLI:

  ```
  artifacts/user-style-e2e/cli/<scenario>/*.mp4
  ```

**Important:**
If a scenario test is **created or modified**, the PR **must include fresh user-like videos**.

---

## 5. Integration scenario tests

Some scenario tests may also require **real external services**
(e.g. AI-powered flows or external system sync).

**Location:**

```
tests/scenario/**/integration/**/*.scenario.test.ts
```

**Rules:**

* treated as integration tests
* require secrets and gated CI execution
* excluded from default scenario runs
* executed only in approved integration jobs

---

## 6. userSleep and helper utilities

All helper utilities are located in:

```
tests/test-utils.ts
```

### userSleep

```ts
await userSleep();      // default ~1500ms in userlike
await userSleep(3000); // custom delay
```

* waits only in `userlike` mode
* always `0ms` in `smokecheck`
* delays are **explicit and intentional**

---

## 7. Run commands summary

### Default (safe, fast)

* `test` — unit + regular e2e (no integrations)
* `test:unit`
* `test:e2e`
* `test:scenario:smoke`

---

### Integration tests (external services, gated)

**Run all integration tests (unit + e2e + scenario):**

```bash
test:integration
```

**Equivalent to:**

```bash
test:unit:integration
test:e2e:integration
test:scenario:integration
```

Integration tests:

* are excluded from default runs
* require secrets
* run in dedicated CI jobs
* may require manual approval

---

## 8. Notes

* Integration tests are intentionally **opt-in**
* CI approval is required unless the PR author has `write` access
