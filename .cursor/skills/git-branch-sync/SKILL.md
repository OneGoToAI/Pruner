---
name: git-branch-sync
description: Sync local repo with remote main branch, create feature branches, and manage pre-commit/pre-push checks. Use when starting new work, before making commits, when user says "start working on", "create branch", "sync with main", "pull latest", or before submitting a PR.
---

# Git Branch Sync — Branch Management & Conflict Prevention

Use this skill at the **start of any development task** and **before submitting PRs** to ensure you're working on the latest code, on a properly named branch, and free of conflicts.

## Prerequisites

- The working directory must be a git repository
- Remote `origin` must be configured
- Repository: `1gotoAI/Pruner` (set via environment variables)

## Step-by-Step Procedure

### Step 1: Check Current State

```bash
git status
git branch --show-current
git remote -v
```

- If there are uncommitted changes, **stash them first** with `git stash` or ask the user to commit/discard.
- Note the current branch name.

### Step 2: Sync with Main

```bash
git checkout main
git fetch origin
git pull origin main
```

- If `main` doesn't exist, try `master` as fallback.
- If pull fails due to conflicts, alert the user and stop.

### Step 3: Create Feature Branch

Branch naming convention:

```
<type>/<issue-id>-<short-description>
```

| Type | When to use |
|------|------------|
| `feat/` | New feature or capability |
| `fix/` | Bug fix |
| `chore/` | Maintenance, deps, config |
| `refactor/` | Code refactor, no behavior change |
| `docs/` | Documentation only |

**Examples:**
- `feat/NOV-35-hitl-interrupt-mechanism`
- `fix/NOV-42-tenant-isolation-bug`
- `chore/NOV-50-upgrade-langchain`

**Rules:**
- Use lowercase, hyphens for spaces
- Include Linear issue ID if available (e.g., `NOV-35`)
- Keep the description concise (3-5 words max)

```bash
git checkout -b <branch-name>
```

### Step 4: Verify

```bash
git branch --show-current
git log --oneline -3
```

Confirm the new branch is based on the latest main.

---

## Pre-PR Conflict Prevention Checklist

**CRITICAL: Always perform these checks before creating a PR or pushing final changes.**

### Check 1: Rebase onto Latest Main

Before submitting a PR, always rebase your branch onto the latest `origin/main` to catch conflicts early:

```bash
git fetch origin main
git log --oneline HEAD..origin/main   # see what main has that we don't
git diff origin/main...HEAD --stat    # see our changes vs main
```

If `origin/main` has new commits:

```bash
git rebase origin/main
```

If rebase has conflicts, resolve them locally (much easier than fixing on GitHub).

### Check 2: Detect Overlapping Work

Check if any of your changed files were also modified on `main` since you branched:

```bash
# Files changed in our branch
git diff origin/main...HEAD --name-only > /tmp/our-files.txt

# Files changed on main since we branched
MERGE_BASE=$(git merge-base HEAD origin/main)
git diff ..origin/main --name-only > /tmp/main-files.txt

# Overlapping files (potential conflicts)
comm -12 <(sort /tmp/our-files.txt) <(sort /tmp/main-files.txt)
```

If there are overlapping files:
- **Review each one** — determine if both changes are needed or if one supersedes the other
- If changes overlap significantly, consider **rebasing and resolving** before pushing

### Check 3: Verify API Compatibility

When tests reference internal functions/classes, verify they still exist on `main`:

```bash
# Example: check if a function still exists at the expected import path
python3 -c "from novie_agentic.core.llm import get_llm; print('OK')" 2>&1
```

Common API drift patterns to watch for:
- Module reorganization (e.g., `core.config.get_llm` → `core.llm.get_llm`)
- Function signature changes (added/removed parameters)
- Renamed or deleted functions
- Pydantic model field changes

### Check 4: Local CI Simulation

Run the same checks CI will run before pushing:

```bash
# Lint + type check
uv run ruff check apps/agentic/
uv run mypy --config-file apps/agentic/pyproject.toml apps/agentic/

# Unit tests
uv run pytest apps/agentic/tests/ -v --tb=short --no-cov
```

---

## Scope Discipline: Avoid Duplicate Commits

### Problem

When multiple branches modify the same core files, merging creates massive conflicts. This typically happens when:
- Two branches independently refactor the same module
- A "big refactor" branch coexists with feature branches touching the same area
- Archived/moved files are handled differently across branches (rename vs delete)

### Prevention Rules

1. **One owner per file area** — If a refactoring PR is in-flight for a module, do NOT modify the same files in another branch
2. **Small, focused PRs** — Keep PRs scoped to a single concern. Separate tests, config, and core changes into distinct PRs when possible
3. **Check main before starting** — Run `git log origin/main --oneline -10` to see recent merges that might overlap with your planned work
4. **Communicate via Linear** — Before starting work on shared code areas, check if related issues are already in progress

### Recovery: When Duplicate Work Happens

If you discover your branch overlaps with recently merged changes:

1. **Identify unique additions** — What does your branch have that `main` does not?
2. **Reset to main** — `git reset --hard origin/main`
3. **Cherry-pick or re-apply only unique changes** — Copy unique files from backup, not the overlapping ones
4. **Force push** — `git push --force-with-lease` to update the PR

---

## How to Derive Branch Name

1. If user provides a **Linear issue ID** (e.g., NOV-35), use it as prefix after type
2. If user provides a **description**, extract keywords for the short description
3. If user provides **both**, combine them: `feat/NOV-35-short-description`
4. If neither is provided, **ask the user** for a branch name or description

## Error Handling

| Error | Action |
|-------|--------|
| Uncommitted changes | `git stash`, proceed, remind user to `git stash pop` later |
| Branch already exists | Ask user: checkout existing or create with suffix? |
| Pull conflicts on main | Alert user, do NOT force-resolve |
| No remote configured | Alert user to set up remote first |
| Rebase conflicts | Resolve interactively, `git rebase --continue` after each fix |
| Duplicate work detected | Follow Recovery procedure above |
