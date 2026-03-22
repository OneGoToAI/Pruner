# Pruner

**Save 20–70% on Claude Code costs. Zero config. Drop-in replacement.**

Pruner runs silently in the background while you use Claude Code, automatically reducing what you spend on every API call — without changing how Claude behaves.

---

## Install

**macOS / Linux — one line:**

```bash
curl -fsSL https://raw.githubusercontent.com/OneGoToAI/pruner-releases/main/install.sh | bash
```

**macOS — Homebrew:**

```bash
brew install OneGoToAI/tap/pruner
```

---

## Usage

Replace `claude` with `pruner`. That's it.

```bash
# Before
claude

# After — same flags, same experience, lower cost
pruner
pruner --resume
pruner -p "fix the build"
```

After each response you'll see a live savings summary:

```
────────────────────────────────────────────────────────
 Pruner  #4  31,204→18,940 tok  -39.3%  $0.037 │ ⚡ 48,570 cached  $0.131 │ Σ $0.412
────────────────────────────────────────────────────────
```

When you exit, a session report is printed:

```
────────────────────────────────────────────────────────
 Pruner  Session Report
────────────────────────────────────────────────────────
 Requests               12
 Original tokens   128,432
 After pruning      31,204
 Pruning saved      75.7%  $0.29
 Cache hit tokens   48,570
 Cache saved               $0.13
────────────────────────────────────────────────────────
 Total saved              $0.42
 Duration                  183s
────────────────────────────────────────────────────────
```

---

## Commands

| Command | Description |
|---|---|
| `pruner` | Start Claude with cost optimization |
| `pruner config` | Open the config file in your editor |
| `pruner reset` | Reset the current session statistics |
| `pruner <any claude flag>` | All Claude CLI flags are passed through |

---

## Configuration

Run `pruner config` to open `~/.pruner/config.json`.

```json
{
  "proxyPort": 7777,
  "optimizer": {
    "enablePromptCache": true,
    "enableContextPruning": true,
    "enableTruncation": true,
    "maxMessages": 20,
    "maxToolOutputChars": 3000
  },
  "pricing": {
    "inputPerMillion": 3.0,
    "outputPerMillion": 15.0,
    "cacheWritePerMillion": 3.75,
    "cacheReadPerMillion": 0.3
  }
}
```

Changes take effect immediately — no restart needed.

---

## Requirements

- macOS (Apple Silicon or Intel) or Linux x64
- [Claude Code CLI](https://claude.ai/download) installed

---

## License

Proprietary software. See [LICENSE](https://github.com/OneGoToAI/pruner-releases/blob/main/LICENSE) for terms.  
Copyright © 2026 OneGoToAI. All rights reserved.
