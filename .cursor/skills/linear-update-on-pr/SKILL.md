---
name: linear-update-on-pr
description: Update Linear issue status and add a comment with PR link after a PR passes CI checks. Use when user says "update Linear", "mark issue done", "PR is ready", or after CI checks pass successfully.
---

# Linear Update on PR — Sync Issue Status After PR Success

Use this skill **after a PR has been created and CI checks have passed** to update the corresponding Linear issue.

## Prerequisites

- A PR exists and CI checks have passed (or PR is ready for review)
- The Linear issue ID is known (e.g., `NA-35` from the branch name or PR title)
- MCP `user-linear` is configured

## Step-by-Step Procedure

### Step 1: Identify the Linear Issue

Extract the issue identifier from one of these sources (in order of priority):

1. **User explicitly provides it** (e.g., "update NA-35")
2. **Branch name** — parse from `feat/NA-35-description` → `NA-35`
3. **PR title** — parse from `NA-35: implement feature` → `NA-35`
4. **Ask the user** if none of the above yields an ID

### Step 2: Get Current Issue State

Use MCP `user-linear` → `get_issue`:

```json
{
  "id": "NA-35"
}
```

Verify:
- The issue exists
- The current status (to avoid redundant updates)

### Step 3: Update Issue Status

Use MCP `user-linear` → `update_issue`:

```json
{
  "id": "<issue-id>",
  "state": "In Review"
}
```

**Status transition map:**

| PR Event | Target Linear Status |
|----------|---------------------|
| Draft PR created, CI pending | `In Review` |
| Draft PR created, CI passed | `In Review` |
| PR merged | `Done` |

- If the issue is already in the target status, skip the update.
- If the team uses different status names, call `list_issue_statuses` first to discover available statuses, then pick the closest match.

### Step 4: Add PR Link as Comment

Use MCP `user-linear` → `create_comment`:

```json
{
  "issueId": "<issue-id>",
  "body": "**PR Submitted** — [#<pr-number>: <pr-title>](<pr-url>)\n\nCI Status: ✅ All checks passed\n\nChanges: <brief summary of key changes>"
}
```

### Step 5: Attach PR Link to Issue

Use MCP `user-linear` → `update_issue` with links:

```json
{
  "id": "<issue-id>",
  "links": [
    {
      "url": "<pr-url>",
      "title": "PR #<pr-number>: <pr-title>"
    }
  ]
}
```

### Step 6: Report Result

Output:
- Confirmation of Linear issue status update
- Link to the Linear issue
- Link to the PR

## Notes

- If the user doesn't have a Linear issue for this work, **skip this skill entirely** — don't create a new issue unless explicitly asked.
- The status names (`In Review`, `Done`, etc.) may differ between teams. Always call `list_issue_statuses` with the team name/ID if unsure.
- If `update_issue` fails because of an invalid state name, fall back to listing available statuses and retry with the correct one.
