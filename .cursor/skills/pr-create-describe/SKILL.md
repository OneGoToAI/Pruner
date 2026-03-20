---
name: pr-create-describe
description: Commit changes, push branch, and create a GitHub Pull Request with an auto-generated description based on code diff and Linear issue context. Use when user says "create PR", "submit PR", "push and create pull request", or "open a PR".
---

# PR Create & Describe — Commit, Push, and Open Pull Request

Use this skill to **commit staged changes, push the branch, and create a well-described PR** linking code changes to the requirement context.

## Prerequisites

- On a feature branch (not `main`/`master`)
- Changes are ready to commit (or already committed)
- Repository has a remote `origin`

## Step-by-Step Procedure

### Step 1: Identify Repository Info

```bash
git remote get-url origin
```

Extract `owner` and `repo` from the remote URL (e.g., `github.com/owner/repo.git`).

### Step 2: Ensure Changes Are Committed

```bash
git status
git diff --stat
```

If there are uncommitted changes:

1. Review all changes with `git diff` (unstaged) and `git diff --cached` (staged)
2. Create commit(s) following **conventional commit** format from `git-conventions.mdc`:

```
feat: add brainstorming workflow YAML
fix: correct tenant isolation in analyst router
NA-35: implement HITL interrupt mechanism
```

3. Stage and commit:

```bash
git add <relevant-files>
git commit -m "<conventional-commit-message>"
```

- **NEVER** use `--no-verify`
- If pre-commit hooks fail, fix the issue first (see `git-conventions.mdc`)

### Step 3: Analyze Changes for PR Description

Run these in parallel to gather context:

**A. Git diff against base branch:**

```bash
git log main..HEAD --oneline
git diff main...HEAD --stat
```

**B. GitNexus change impact analysis** (MCP: `user-gitnexus`):

Call `detect_changes` with `scope: "compare"` and `base_ref: "main"` to understand:
- Which symbols changed
- Which execution flows are affected
- Risk assessment

**C. Linear issue context** (MCP: `user-linear`, if issue ID is available):

Call `get_issue` with the Linear issue ID to retrieve:
- Issue title and description
- Acceptance criteria
- Priority and labels

### Step 4: Push the Branch

```bash
git push -u origin HEAD
```

### Step 5: Create the Pull Request

Use MCP tool `user-github` → `create_pull_request` with:

```json
{
  "owner": "<owner>",
  "repo": "<repo>",
  "title": "<PR title>",
  "head": "<current-branch>",
  "base": "main",
  "body": "<generated PR body>",
  "draft": true
}
```

### PR Title Format

Mirror the primary commit's conventional commit message, or summarize if multiple commits:

- Single commit: `feat: add HITL interrupt mechanism`
- Multiple commits: `feat: HITL interrupt mechanism + workflow lifecycle fixes`
- With issue ID: `NA-35: implement HITL interrupt mechanism`

### PR Body Template

Generate the body using this structure:

```markdown
## Summary

<2-4 bullet points describing WHAT changed and WHY>

## Linear Issue

- [NA-XX: Issue Title](https://linear.app/team/issue/NA-XX)

## Changes

<List of key changes grouped by area, derived from git diff and GitNexus analysis>

### Files Changed
- `path/to/file.py` — <brief description>
- `path/to/other.py` — <brief description>

## Impact Analysis

<Risk level from GitNexus detect_changes>
<Affected execution flows>
<Affected modules>

## Test Plan

- [ ] <Specific test scenarios based on the changes>
- [ ] <Edge cases to verify>
- [ ] Existing tests pass (`uv run pytest`)
- [ ] Lint clean (`uv run ruff check .`)
```

### Step 6: Report Result

After PR creation, output:
- PR URL
- PR number (needed for CI monitoring skill)
- Summary of what was included

## Notes

- If the user doesn't specify a Linear issue ID, skip the Linear section in the PR body
- If GitNexus is not available or returns errors, fall back to `git diff --stat` for the impact section
- Always ensure the PR base is `main` unless the user specifies otherwise
