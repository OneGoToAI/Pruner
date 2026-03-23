# Pruner

**A zero-config local proxy that cuts your Claude Code API bill by 20–70%.**

[![CI](https://github.com/OneGoToAI/Pruner/actions/workflows/ci.yml/badge.svg)](https://github.com/OneGoToAI/Pruner/actions/workflows/ci.yml)
[![Latest Release](https://img.shields.io/github/v/release/OneGoToAI/Pruner?color=green)](https://github.com/OneGoToAI/Pruner/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey)](#install)

Pruner sits between Claude Code and the Anthropic API, automatically optimizing every request in real time. It trims redundant context, injects prompt caching, and reports exactly how much you saved — verified by Anthropic's own tokenizer.

```
────────────────────────────────────────────────────────
 Pruner  #4  31,204→18,940 tok✓  -39.3%  $0.037 │ ⚡ 48,570 cached✓  $0.131 │ Σ $0.412
────────────────────────────────────────────────────────
```

---

## Table of Contents

- [How it works](#how-it-works)
- [Security](#security)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

---

## How it works

When you run `pruner`, it:

1. Starts a local HTTP proxy on `127.0.0.1:7777`
2. Sets `ANTHROPIC_BASE_URL=http://127.0.0.1:7777` in the environment
3. Spawns the real `claude` CLI with all your original flags

Every API request passes through three optimization stages before reaching Anthropic:

| Stage | What it does |
|---|---|
| **Context pruning** | Removes old messages beyond `maxMessages`. Inserts a placeholder so Claude understands the gap. Truncates oversized tool outputs. |
| **Prompt cache injection** | Automatically adds `cache_control: { type: "ephemeral" }` to system prompts over 1,024 tokens. Cache reads cost 10× less than regular input ($0.30 vs $3.00 per million tokens). |
| **Verified savings** | Calls `/v1/messages/count_tokens` in parallel (zero latency) to get Anthropic's own token count. Reports actual `usage.input_tokens` from each response. |

Nothing is sent to any server other than `api.anthropic.com`. Verify it yourself:

```bash
pruner --debug
# [debug] → api.anthropic.com:443  POST /v1/messages
# [debug] ✗ no other outbound connections

sudo lsof -i -n -P | grep pruner  # independent verification
```

---

## Security

**Pruner is a local-only proxy. Your code, prompts, and API key never leave your machine except to go directly to Anthropic — the same destination they'd reach without Pruner.**

### What Pruner does and does not do

| | Detail |
|---|---|
| ✅ **Binds only to localhost** | The proxy listens on `127.0.0.1:7777` — not reachable from your network or the internet |
| ✅ **Only connects to `api.anthropic.com`** | Zero telemetry, no analytics, no third-party servers |
| ✅ **API key is never stored** | Forwarded in-memory, transparently, to Anthropic — identical to what Claude CLI does |
| ✅ **No data collection** | Pruner has no backend, no accounts, no servers that receive your data |
| ✅ **Open source (MIT)** | Every line of code is on GitHub — read it, audit it, compile it yourself |
| ✅ **Signed binaries** | The install script verifies a SHA-256 checksum before installing |

### Verify it yourself

You don't have to take our word for it. Use `--debug` mode to see every outbound connection Pruner makes:

```bash
pruner --debug
# [debug] → api.anthropic.com:443  POST /v1/messages
# [debug] ✗ no other outbound connections
```

Or use your OS independently:

```bash
# macOS / Linux — see every socket opened by the pruner process
sudo lsof -i -n -P | grep pruner
```

You should see exactly one remote address: `api.anthropic.com:443`.

### Build from source

If you don't want to trust a pre-built binary, building from source takes under a minute:

```bash
git clone https://github.com/OneGoToAI/Pruner.git
cd Pruner
npm install
npm run build:bin:mac-arm   # or mac-x64 / linux
```

The compiled binary is bit-for-bit identical to the one in the release — same build command, same Bun version (pinned in CI).

---

## Install

### macOS / Linux — one line

```bash
curl -fsSL https://raw.githubusercontent.com/OneGoToAI/Pruner/main/install.sh | bash
```

The script detects your OS and architecture, downloads the correct binary, verifies its SHA-256 checksum, and installs to `/usr/local/bin`.

### macOS — Homebrew

```bash
brew install OneGoToAI/tap/pruner
```

### Build from source

Requires [Bun](https://bun.sh) ≥ 1.0 and Node.js ≥ 18.

```bash
git clone https://github.com/OneGoToAI/Pruner.git
cd Pruner
npm install
npm run build          # TypeScript → dist/
node dist/index.js     # run directly

# Or compile a self-contained binary
npm run build:bin:mac-arm   # Apple Silicon
npm run build:bin:mac-x64   # Intel Mac
npm run build:bin:linux      # Linux x64
```

---

## Usage

Replace `claude` with `pruner`. Every Claude CLI flag is passed through unchanged.

```bash
# Start an interactive session
pruner

# Resume the last conversation
pruner --resume

# Run a one-shot prompt
pruner -p "refactor the auth module for testability"

# Verify Pruner's network activity
pruner --debug
```

When you exit, a session report is printed:

```
────────────────────────────────────────────────────────
 Pruner  Session Report  ✓ verified
────────────────────────────────────────────────────────
 Requests                        12
 Original tokens            128,432
 After pruning               31,204
 Pruning saved           75.7%  $0.29
 Cache hit tokens         48,570 ✓
 Cache saved                   $0.13
────────────────────────────────────────────────────────
 Total saved                   $0.42
 Duration                       183s
────────────────────────────────────────────────────────
```

Numbers marked `✓ verified` come directly from Anthropic's API. Numbers marked `~estimated` use tiktoken as a fallback (within ~10%).

### Commands

| Command | Description |
|---|---|
| `pruner` | Start Claude with cost optimization |
| `pruner --debug` | Show every outbound connection |
| `pruner config` | Open `~/.pruner/config.json` in your editor |
| `pruner reset` | Reset session statistics |
| `pruner <any claude flag>` | All Claude CLI flags pass through |

---

## Configuration

Run `pruner config` to open `~/.pruner/config.json`. Changes take effect immediately — no restart needed.

```json
{
  "proxyPort": 7777,
  "optimizer": {
    "enablePromptCache": true,
    "enableContextPruning": true,
    "enableTruncation": true,
    "accurateTokenCounting": true,
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

| Option | Default | Description |
|---|---|---|
| `proxyPort` | `7777` | Local proxy port. Increments automatically if occupied. |
| `enablePromptCache` | `true` | Inject `cache_control` on large system prompts. |
| `enableContextPruning` | `true` | Trim old messages past `maxMessages`. |
| `enableTruncation` | `true` | Cap individual tool outputs at `maxToolOutputChars`. |
| `accurateTokenCounting` | `true` | Use Anthropic's `count_tokens` API for exact figures. |
| `quiet` | `false` | Suppress per-request inline output. Stats are written to `~/.pruner/session.log` instead. Recommended when Claude Code's TUI feels cluttered. |
| `maxMessages` | `20` | Maximum messages to keep. First message is always preserved. |
| `maxToolOutputChars` | `3000` | Characters per tool result before truncation. |
| `pricing.*` | claude-3-5-sonnet rates | Override if you use different models or have custom pricing. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  pruner (src/index.ts)                                       │
│  ├── Checks for 'claude' CLI                                 │
│  ├── Starts local proxy on 127.0.0.1:7777                   │
│  └── Spawns claude with ANTHROPIC_BASE_URL injected          │
└─────────────────────────┬───────────────────────────────────┘
                          │ all API traffic
┌─────────────────────────▼───────────────────────────────────┐
│  AnthropicProxy (src/proxy.ts)                               │
│                                                              │
│  Incoming request                                            │
│  ├── [1] optimize()         src/optimizer/index.ts           │
│  │       ├── injectPromptCache()   optimizer/cache.ts        │
│  │       └── pruneContext()        optimizer/pruner.ts       │
│  │             └── truncateLargeContent()  truncate.ts       │
│  ├── [2] fetchExactTokenCount()   stats/counter.ts  ─┐      │
│  └── [3] undiciRequest() → api.anthropic.com          │ parallel
│                                                        │      │
│  Response                                              │      │
│  ├── parse usage.input_tokens (verified compTokens)   │      │
│  ├── await count_tokens result  ◄─────────────────────┘      │
│  ├── recordRequest()        stats/session.ts                 │
│  └── printRequestLog()                                       │
└─────────────────────────────────────────────────────────────┘
```

**Key files:**

| File | Purpose |
|---|---|
| `src/index.ts` | CLI entry point, process management |
| `src/proxy.ts` | Fastify proxy server, request/response pipeline |
| `src/config.ts` | `~/.pruner/config.json` with hot-reload |
| `src/optimizer/cache.ts` | Prompt cache injection |
| `src/optimizer/pruner.ts` | Context pruning and message cap |
| `src/optimizer/truncate.ts` | Large content head+tail truncation |
| `src/stats/counter.ts` | tiktoken + Anthropic count_tokens API |
| `src/stats/session.ts` | In-memory session statistics |

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

```bash
# Setup
git clone https://github.com/OneGoToAI/Pruner.git
cd Pruner
npm install

# Development (runs TypeScript directly via tsx)
npm run dev

# Tests (32 unit tests, Vitest)
npm test

# Lint
npm run lint

# Type check
npm run build
```

**Opening a PR?** Please:
- Add or update tests for any behavior change
- Run `npm test` and `npm run build` before pushing
- Keep commits focused; one logical change per PR

For larger changes (new features, architectural changes), please open an issue first to discuss the approach.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Acknowledgements

- [Fastify](https://fastify.dev) — the proxy server
- [undici](https://github.com/nodejs/undici) — HTTP client
- [tiktoken](https://github.com/dqbd/tiktoken) — fallback token counting
- [Bun](https://bun.sh) — binary compilation
- [Anthropic](https://anthropic.com) — for the count_tokens API that makes verified savings possible
