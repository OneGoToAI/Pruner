# Contributing to Pruner

Thank you for your interest in contributing. This document covers the development workflow, code conventions, and how to submit changes.

## Table of Contents

- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Running tests](#running-tests)
- [Submitting a PR](#submitting-a-pr)
- [Reporting bugs](#reporting-bugs)
- [Feature requests](#feature-requests)

---

## Development setup

**Requirements:** Node.js ≥ 18, npm.

```bash
git clone https://github.com/OneGoToAI/Pruner.git
cd Pruner
npm install
```

Run Pruner in development mode (TypeScript source, no compile step):

```bash
npm run dev           # starts pruner + claude
npm run dev:proxy     # starts proxy only (useful for testing without claude)
```

Build the compiled output:

```bash
npm run build         # TypeScript → dist/
```

---

## Project structure

```
src/
├── index.ts              CLI entry point
├── proxy.ts              Fastify proxy server
├── config.ts             ~/.pruner/config.json management
├── optimizer/
│   ├── index.ts          Optimization pipeline entry point
│   ├── cache.ts          Prompt cache injection
│   ├── pruner.ts         Context pruning (message cap + tool truncation)
│   └── truncate.ts       Large content head+tail truncation
└── stats/
    ├── counter.ts        Token counting (tiktoken + Anthropic API)
    └── session.ts        In-memory session statistics
```

---

## Running tests

```bash
npm test              # run all tests (watch mode)
npm test -- --run     # single pass (used in CI)
```

The test suite uses [Vitest](https://vitest.dev). Tests live next to the code they test (`*.test.ts`).

**When adding a feature or fixing a bug, please add a corresponding test.**

The optimizer modules have thorough unit tests in `src/optimizer/optimizer.test.ts` — use these as a reference for test style.

---

## Submitting a PR

1. **Fork** the repository and create a branch from `main`.

2. **Make your changes.** Keep commits focused — one logical change per commit.

3. **Add tests** for any behavior you introduce or change.

4. **Verify everything passes:**
   ```bash
   npm run build    # must succeed with no TypeScript errors
   npm test -- --run
   npm run lint
   ```

5. **Open a pull request** against `main`. Describe:
   - What problem it solves
   - How you tested it
   - Any trade-offs or open questions

For **significant changes** (new optimization strategies, architectural changes, new commands), please open an issue first so we can discuss the approach before you invest time in the implementation.

---

## Reporting bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template. Include:

- Pruner version (`pruner --version` once implemented, or the release tag)
- OS and architecture
- The exact error or unexpected behavior
- Steps to reproduce
- Output of `pruner --debug` if the issue is network-related

---

## Feature requests

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) template. Good feature requests explain the problem they solve, not just the implementation you have in mind.

---

## Code conventions

- **TypeScript strict mode** — no `any` unless unavoidable and explicitly suppressed with a comment explaining why.
- **No console.log** — all user-facing output goes through `process.stderr.write` with chalk formatting.
- **Error handling** — proxy errors must never crash the process or expose raw stack traces to the user.
- **No magic numbers** — use named constants or config values.
- **Comments** — explain *why*, not *what*. Code that needs a comment to explain what it does should probably be refactored.
