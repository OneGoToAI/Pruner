---
name: linear-agentic-issues
description: When creating or drafting Linear issues for the AI orchestration (agentic) work area, follow the team title format in English and always add the Agentic label. Use when writing Linear issue titles, creating issues for agentic/orchestrator work, or when the user asks about Linear issue format or agentic issue conventions.
---

# Linear Issue Format — Agentic Work Area

Use this format when creating or drafting Linear issues that fall under your responsibility (AI orchestration / agentic).

## Title Format (English)
[Px] [type] Short descriptive title in English

- **Priority first**: `[P0]` (urgent) through `[P2]` / `[P8]` as used by the team. Use the same P-scale as existing issues.
- **Type second**: One of the type tags below.
- **Title**: Clear, in English. No need to repeat [agentic] in the title.

## Type Tags

| Tag       | Use for |
|----------|---------|
| `[feat]` | New feature or capability |
| `[fix]`  | Bug fix or correction |
| `[bug]`  | Bug report or fix (alternate) |
| `[doc]`  | Documentation only |
| `[refactor]` | Code refactor, no behavior change |
| `[arch]` | Architecture or design decision |
| `[design]` | UI/UX or design work |

Use lowercase in the title, e.g. `[feat]`, `[doc]`.

## Label (Required for Your Area)

- **Always add the Linear label**: `Agentic` (or the exact label name your workspace uses for the agentic work area).
- This marks the issue as your responsibility and allows filtering "my work" in Linear.
- Do not add `[agentic]` in the title; use the label only.

## Examples

- `[P0] [feat] PM SubAgent skeleton and Registry registration`
- `[P1] [feat] seed_skills guard against overwrite and learned namespace`
- `[P1] [feat] In-process Event Bus for analyst workflow events`
- `[P2] [refactor] Supervisor system prompt structured config`
- `[P1] [doc] Agentic data pipeline and sync services guideline`
- `[P2] [fix] Workflow lifecycle bugs — envelope, routing fast-path, artifact path`

## Checklist When Creating an Issue

- [ ] Title starts with `[Px]` (priority).
- [ ] Second segment is `[type]` (e.g. `[feat]`, `[doc]`).
- [ ] Rest of title is in English and concise.
- [ ] Label `Agentic` (or equivalent) is added to the issue.
