## Setup test runs on CI
There should be parallel checks setup in CI

test unit (npm run test:unit)
test e2e (npm run test:e2e)
test smoke (npm run test:scenario:smoke)

## Github Config example for non-gated tests

```yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test_unit:
    name: test unit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      # setup-node supports built-in npm cache via `cache: npm`. :contentReference[oaicite:0]{index=0}

      - name: Install deps
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

  test_e2e:
    name: test e2e
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install deps
        run: npm ci

      # If your regular e2e tests use Playwright, uncomment this:
      # - name: Install Playwright browsers + OS deps
      #   run: npx playwright install --with-deps
      # Playwright recommends installing browsers/deps in CI. :contentReference[oaicite:1]{index=1}

      - name: Run e2e tests
        run: npm run test:e2e

  test_smoke:
    name: test smoke
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install deps
        run: npm ci

      - name: Run scenario smokecheck
        run: npm run test:scenario:smoke

      # Upload smoke logs ONLY if the job failed
      - name: Upload smoke logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: smokecheck-logs
          path: .cache/smokecheck
      # actions/upload-artifact v4 is the supported version. :contentReference[oaicite:2]{index=2}


```

## Instructions for integration (gated) tests


“Integration tests” are any tests that may call **real external services** and require **secrets** (AI providers, GitHub, Jira, etc.). This includes:

* `tests/unit/integration/**`
* `tests/e2e/integration/**`
* `tests/scenario/**/integration/**`

Integration tests must be invoked via:

```bash
npm run test:integration
```

## Why this policy exists

Integration tests are **privileged**:

* they can incur real costs (API usage)
* they can affect real external systems
* they require credentials and must not leak secrets

Therefore, integration tests must only run under **controlled CI conditions**.

---

## Requirements

### 1) Mandatory GitHub Environments

Every repository that contains integration tests **MUST** define two GitHub Environments:

1. `integration-tests`

   * **Trusted** environment
   * **No manual approval** (no required reviewers)

2. `integration-tests-gated`

   * **Gated** environment
   * **Manual approval required** (Required reviewers enabled)

> Note: GitHub Environment approvals are enforced at the environment level.
> You cannot conditionally require approval for some users in the same environment.
> Using two environments is the supported, secure pattern.

### 2) Secrets placement

All secrets required by integration tests **MUST** be stored as **Environment secrets** (not repo secrets), e.g.:

* `OPENAI_API_KEY`
* `CURSOR_TOKEN`
* `GITHUB_TEST_TOKEN`

### 3) CI execution rules

CI **MUST** run integration tests only via these environments:

* If the PR author has **write / maintain / admin** permission (or is the owner), run integration tests using:

  * `environment: integration-tests` (**no approval**)

* Otherwise, run integration tests using:

  * `environment: integration-tests-gated` (**approval required**)

### 4) Safety rules

* Integration tests **MUST NOT** print secrets or sensitive payloads to logs.
* Credentials must be **least privilege** and safe for test environments.
* By default, integration tests should **not run automatically on fork PRs**.

---

## Programmatic setup of Environments (GitHub Actions example)

Below is an admin-only workflow that **creates/updates** both environments.

Create: `.github/workflows/bootstrap-environments.yml`

```yaml
name: Bootstrap integration environments

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  bootstrap-environments:
    name: Create/update integration environments
    runs-on: ubuntu-latest

    steps:
      - name: Create/update environments
        env:
          # PAT or GitHub App token with permission to manage environments in this repo
          GH_ADMIN_TOKEN: ${{ secrets.GH_ADMIN_TOKEN }}
          OWNER: ${{ github.repository_owner }}
          REPO: ${{ github.event.repository.name }}

          # Reviewer IDs for the gated environment (at least one must be set)
          # Store these as repo/org variables or secrets.
          REVIEWER_USER_ID: ${{ vars.INTEGRATION_REVIEWER_USER_ID }}
          REVIEWER_TEAM_ID: ${{ vars.INTEGRATION_REVIEWER_TEAM_ID }}
        run: |
          set -euo pipefail

          if [ -z "${GH_ADMIN_TOKEN:-}" ]; then
            echo "ERROR: GH_ADMIN_TOKEN is required."
            exit 1
          fi

          api_put_env() {
            local env_name="$1"
            local json_body="$2"
            curl -sS -X PUT \
              -H "Authorization: Bearer $GH_ADMIN_TOKEN" \
              -H "Accept: application/vnd.github+json" \
              -H "X-GitHub-Api-Version: 2022-11-28" \
              "https://api.github.com/repos/$OWNER/$REPO/environments/$env_name" \
              -d "$json_body" > /dev/null
          }

          echo "Creating/updating: integration-tests (trusted, no approval)"
          api_put_env "integration-tests" '{
            "wait_timer": 0,
            "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
          }'

          reviewers="[]"
          if [ -n "${REVIEWER_USER_ID:-}" ]; then
            reviewers=$(jq -c --argjson id "$REVIEWER_USER_ID" '. + [{"type":"User","id":$id}]' <<< "$reviewers")
          fi
          if [ -n "${REVIEWER_TEAM_ID:-}" ]; then
            reviewers=$(jq -c --argjson id "$REVIEWER_TEAM_ID" '. + [{"type":"Team","id":$id}]' <<< "$reviewers")
          fi

          if [ "$reviewers" = "[]" ]; then
            echo "ERROR: Set vars.INTEGRATION_REVIEWER_USER_ID and/or vars.INTEGRATION_REVIEWER_TEAM_ID for gated approvals."
            exit 1
          fi

          echo "Creating/updating: integration-tests-gated (approval required)"
          api_put_env "integration-tests-gated" "$(jq -nc --argjson reviewers "$reviewers" '{
            wait_timer: 0,
            prevent_self_review: false,
            reviewers: $reviewers,
            deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
          }')"

          echo "Done."
```

---

## CI jobs configuration for integrated tests


```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: read

jobs:
  trust_check:
    name: Trust check (write access)
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    outputs:
      is_trusted: ${{ steps.check.outputs.is_trusted }}
      permission: ${{ steps.check.outputs.permission }}
    steps:
      - name: Check collaborator permission for PR author
        id: check
        env:
          GH_TOKEN: ${{ github.token }}
          OWNER: ${{ github.repository_owner }}
          REPO: ${{ github.event.repository.name }}
          USER: ${{ github.event.pull_request.user.login }}
        run: |
          set -euo pipefail
          perm=$(gh api "repos/$OWNER/$REPO/collaborators/$USER/permission" --jq '.permission' 2>/dev/null || echo "none")
          echo "permission=$perm" >> "$GITHUB_OUTPUT"

          if [ "$perm" = "admin" ] || [ "$perm" = "maintain" ] || [ "$perm" = "write" ]; then
            echo "is_trusted=true" >> "$GITHUB_OUTPUT"
          else
            echo "is_trusted=false" >> "$GITHUB_OUTPUT"
          fi

  integration-tests-trusted:
    name: Integration tests (trusted, no approval)
    runs-on: ubuntu-latest
    needs: [trust_check]
    environment: integration-tests

    # Run on push to main (trusted)
    # Run on PRs only if author is trusted
    if: >
      github.event_name == 'push' ||
      (github.event_name == 'pull_request' && needs.trust_check.outputs.is_trusted == 'true')

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: List integration scenarios (optional)
        run: npm run test:scenario:integration:list

      - name: Run integration tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          CURSOR_TOKEN: ${{ secrets.CURSOR_TOKEN }}
          GITHUB_TEST_TOKEN: ${{ secrets.GITHUB_TEST_TOKEN }}
          JIRA_TOKEN: ${{ secrets.JIRA_TOKEN }}
        run: npm run test:integration

  integration-tests-gated:
    name: Integration tests (gated, approval required)
    runs-on: ubuntu-latest
    needs: [trust_check]
    environment: integration-tests-gated

    # Only for untrusted PRs, and skip forks by default.
    if: >
      github.event_name == 'pull_request' &&
      needs.trust_check.outputs.is_trusted != 'true' &&
      github.event.pull_request.head.repo.full_name == github.repository

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: List integration scenarios (optional)
        run: npm run test:scenario:integration:list

      - name: Run integration tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          CURSOR_TOKEN: ${{ secrets.CURSOR_TOKEN }}
          GITHUB_TEST_TOKEN: ${{ secrets.GITHUB_TEST_TOKEN }}
          JIRA_TOKEN: ${{ secrets.JIRA_TOKEN }}
        run: npm run test:integration
```

---

## Operational notes

* To enable the **approval gate**, configure Required reviewers in `integration-tests-gated`.
* You do **not** need any “trusted users list” variable: trust is derived from GitHub permissions (`write/maintain/admin`).
* Fork PRs are skipped for safety by default (recommended). If you want to allow them, remove the fork condition—but it increases risk.

