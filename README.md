# context-monitor

A single-purpose Claude Code plugin that watches per-session context usage and warns the user before quality degrades.

It does one thing: read the live token count out of the transcript, count how many auto-compactions have happened, and emit a tiered notification when either crosses a threshold. Output is rendered with [`@aeriondyseti/plugin-kit`](https://github.com/aeriondyseti/plugin-kit).

## What it watches

| Signal               | Note                          | Warn   | Strong  | Critical |
| -------------------- | ----------------------------- | ------ | ------- | -------- |
| Context size (% of window) | latest main-chain transcript entry | 50% | 75% | 90% |
| Compactions          | counted via `SessionStart` (matcher: `compact`) | 2 | 4 | 6 |

### Context window

Context thresholds are a percentage of the session's context window, resolved in the same order Claude Code configures it:

1. `CLAUDE_CODE_AUTO_COMPACT_WINDOW` env var
2. `autoCompactWindow` in settings — `<cwd>/.claude/settings.local.json`, then `<cwd>/.claude/settings.json`, then `~/.claude/settings.json` (clamped to 100k–1M)
3. A `[1m]` model alias (e.g. `opus[1m]`) in the hook input or settings `model` → 1,000,000
4. Default → 200,000

If the observed context is already larger than the resolved window, the session must be on the extended window, so it is treated as 1,000,000.

Token count = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` from the most recent main-chain entry, matching ccstatusline's accounting. Sidechain (subagent) entries and API errors are excluded.

## Hooks

One bundled script (`hooks/context-monitor.mjs`) is wired to three events, branched by argv:

| Event          | Matcher    | Argv                | Behavior                                             |
| -------------- | ---------- | ------------------- | ---------------------------------------------------- |
| `Stop`         | `*`        | `--stop`            | Always evaluates at end of turn.                     |
| `PostToolUse`  | `*`        | `--post-tool-use`   | Throttled to one evaluation per 30 seconds.          |
| `SessionStart` | `compact`  | `--session-compact` | Increments the per-session compression counter.      |

`Stop` will never `block` — that would create an infinite re-entry loop.

## Output

Healthy session: empty JSON output (no notification).

When a threshold trips, a boxed message is shown to the user, e.g.:

```
┌─ · Session health warning ──────────────────────────────────────────────────┐
│ ⚠ Context size is 160,000 tokens (80% of 200,000) — compression approaching │
└─────────────────────────────────────────────────────────────────────────────┘
▸ Finish the current task, commit, and start a new session to preserve quality.
```

## Layout

```
context-monitor/
├── .claude-plugin/plugin.json
├── hooks/
│   ├── hooks.json
│   └── context-monitor.mjs   ← vendored single-file bundle (committed)
├── src/context-monitor.ts    ← source for the bundle
├── package.json
├── tsconfig.json
└── README.md
```

`hooks/context-monitor.mjs` is the artifact end users actually run. It bundles `@aeriondyseti/plugin-kit` so the plugin works with no `npm install` step on the install side.

## Building

```bash
npm install
npm run typecheck
npm run build   # rewrites hooks/context-monitor.mjs
```

The bundle targets Node 20+ ESM. It runs under any Claude Code installation since Node is the host runtime.

## State

Per-session counters live at `${TMPDIR}/context-monitor/<session-id>.json`. They're best-effort: a missing or unreadable state file just means the next invocation starts cold.
