---
name: ci-monitor-fix
description: Monitor CI/CD check status after a PR is submitted, retrieve error logs on failure, and fix issues automatically. Use when user says "check CI", "monitor PR checks", "fix CI", "CI failed", or after creating a PR.
---

# CI Monitor & Fix — Automatic CI Monitoring Loop

Use this skill **after a PR is created** to automatically monitor CI/CD pipeline status, retrieve failure logs, fix issues, and re-monitor until all checks pass.

## Prerequisites

- A PR has been created (you need the PR number)
- Repository: `1gotoAI/Pruner` (set via environment variables)
- Git credentials available in `~/.git-credentials`

## Step-by-Step Procedure

### Step 1: Extract GitHub Token & Define Helper

All API calls use the stored git credentials. Extract the token once:

```bash
TOKEN=$(cat ~/.git-credentials 2>/dev/null | grep github.com | head -1 | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')
```

### Step 2: Poll Check Runs Until All Complete

Query the check runs for the PR's head commit SHA and poll until no checks have `status: "in_progress"` or `status: "queued"`.

```bash
curl -s \
  -H "Authorization: token " \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/1gotoAI/Pruner/commits/<HEAD_SHA>/check-runs" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
total = d['total_count']
done = sum(1 for cr in d['check_runs'] if cr['status'] == 'completed')
failed = [cr['name'] for cr in d['check_runs'] if cr.get('conclusion') == 'failure']
passed = [cr['name'] for cr in d['check_runs'] if cr.get('conclusion') == 'success']
skipped = [cr['name'] for cr in d['check_runs'] if cr.get('conclusion') == 'skipped']
running = [cr['name'] for cr in d['check_runs'] if cr['status'] in ('in_progress', 'queued')]
print(f'Total: {total} | Done: {done} | Running: {len(running)}')
print(f'  Passed:  {passed}')
print(f'  Failed:  {failed}')
print(f'  Skipped: {skipped}')
print(f'  Running: {running}')
print(f'ALL_DONE={\"yes\" if done == total and total > 0 else \"no\"}')
print(f'HAS_FAILURE={\"yes\" if failed else \"no\"}')
"
```

**Polling strategy:**

| Interval | When |
|----------|------|
| `sleep 30` | First 3 polls |
| `sleep 60` | Polls 4-10 |
| `sleep 120` | Polls 11+ |
| **Stop** | After 20 polls (~25 min) or all checks complete |

- If `ALL_DONE=yes` and `HAS_FAILURE=no` → **All CI passed**, go to Step 6.
- If `ALL_DONE=yes` and `HAS_FAILURE=yes` → Go to Step 3.
- If `ALL_DONE=no` → Wait and poll again.

### Step 3: On Failure — Get Error Logs

Find the failed workflow run and download its logs:

```bash
# List workflow runs for the branch
curl -s \
  -H "Authorization: token " \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/1gotoAI/Pruner/actions/runs?branch=<BRANCH>&per_page=5" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for run in d['workflow_runs']:
    if run.get('conclusion') == 'failure':
        print(f'FAILED_RUN_ID={run[\"id\"]}')
        print(f'  {run[\"name\"]} #{run[\"run_number\"]} - {run[\"html_url\"]}')
        break
"

# Get jobs for the failed run
curl -s \
  -H "Authorization: token " \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/1gotoAI/Pruner/actions/runs/<RUN_ID>/jobs" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for job in d['jobs']:
    if job.get('conclusion') == 'failure':
        print(f'FAILED_JOB_ID={job[\"id\"]}')
        for step in job['steps']:
            icon = '✓' if step.get('conclusion') == 'success' else '✗' if step.get('conclusion') == 'failure' else '○'
            print(f'  {icon} {step[\"name\"]}')
"

# Download failed job logs (last 150 lines usually contain the error)
curl -s -L \
  -H "Authorization: token " \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/1gotoAI/Pruner/actions/jobs/<JOB_ID>/logs" \
  | tail -150
```

### Step 4: Analyze and Fix the Error

Common CI failure categories:

| Category | Indicators | Fix Strategy |
|----------|-----------|-------------|
| **Import sorting** | `I001`, `isort` | `uv run ruff check --fix <path>` |
| **Unused imports** | `F401` | `uv run ruff check --fix <path>`, manual for unsafe fixes |
| **Unused variables** | `F841` | Remove assignment or prefix with `_` |
| **Type errors** | `mypy`, `pyright` | Fix type annotations |
| **Test failures** | `pytest`, `FAILED` | Read test output, fix logic or update tests |
| **Build errors** | `ModuleNotFoundError` | Check imports, run `uv sync` |
| **Line too long** | `E501` | Break long lines |

**Always verify the fix locally before pushing:**

```bash
uv run ruff check apps/agentic/
uv run pytest apps/agentic/tests/ -v --tb=short --no-cov
```

### Step 5: Commit, Push, and Re-monitor

```bash
git add <fixed-files>
git commit -m "fix(ci): <describe the fix>"
git push
```

- **NEVER** use `--no-verify`
- After push, go back to **Step 2** and monitor again
- Repeat the fix → push → monitor cycle up to **3 iterations**
- If still failing after 3 attempts, report full error details to the user

### Step 6: Report Final Status

When all checks pass, output:

- Confirmation that all CI checks passed
- PR number and URL
- List of checks and their status
- Summary of any fixes applied during the process

## Automated Monitor Loop (reference implementation)

For quick use, the full polling loop in one command:

```bash
TOKEN=$(cat ~/.git-credentials 2>/dev/null | grep github.com | head -1 | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')
SHA="<HEAD_SHA>"
for i in $(seq 1 20); do
  RESULT=$(curl -s -H "Authorization: token " -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/1gotoAI/Pruner/commits//check-runs" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
t = d['total_count']
done = sum(1 for c in d['check_runs'] if c['status']=='completed')
fail = [c['name'] for c in d['check_runs'] if c.get('conclusion')=='failure']
run = [c['name'] for c in d['check_runs'] if c['status'] in ('in_progress','queued')]
print(f'Poll {\"\"}: {done}/{t} done, {len(fail)} failed, {len(run)} running')
for c in d['check_runs']:
    s = c.get('conclusion') or c['status']
    print(f'  [{s:>12}] {c[\"name\"]}')
if done == t and t > 0:
    print('STATUS=DONE_FAIL' if fail else 'STATUS=DONE_PASS')
else:
    print('STATUS=PENDING')
")
  echo ""
  echo "" | grep -q "STATUS=DONE_PASS" && echo "All CI passed!" && break
  echo "" | grep -q "STATUS=DONE_FAIL" && echo "CI has failures - investigate" && break
  [ "" -le 3 ] && sleep 30 || { [ "" -le 10 ] && sleep 60 || sleep 120; }
done
```

## Error Handling

| Situation | Action |
|-----------|--------|
| Token not found | Check `~/.git-credentials` exists with github.com entry |
| API rate limit (403) | Wait 60s and retry |
| No check runs (total=0) | CI may not be configured for this path; check `.github/workflows/ci.yml` trigger paths |
| Network timeout | Retry once, then inform user |
| Flaky test (passes on retry) | Note it, suggest investigating later |
| CI infra error (not code-related) | Inform user, suggest re-running on GitHub |
