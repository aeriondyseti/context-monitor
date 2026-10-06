# context-monitor

A single-purpose Claude Code plugin that watches per-session context usage and warns the user before quality degrades.

It does one thing: read the live token count out of the transcript, count how many auto-compactions have happened, and emit a tiered notification when either crosses a threshold. Output is rendered with [`@aeriondyseti/plugin-kit`](https://github.com/aeriondyseti/plugin-kit).

## What it watches

| Signal               | Note                          | Warn   | Strong  | Critical |
| -------------------- | ----------------------------- | ------ | ------- | -------- |
| Context size (% of window) | latest main-chain transcript entry | 50% | 75% | 90% |
| Compactions          | counted via `SessionStart` (matcher: `compact`) | 2 | 4 | 6 |

### Context window

Context thresholds are a percentage of the session's context window, resolved in this order:

1. **Compaction-window override** — `CLAUDE_CODE_AUTO_COMPACT_WINDOW` env var, then `autoCompactWindow` in `<cwd>/.claude/settings.local.json`, `<cwd>/.claude/settings.json`, `~/.claude/settings.json` (clamped to 100k–1M)
2. **Live window from the window-probe mod** — the engine's own `context_window_size` for the current model, cached per session (see [Window probe](#window-probe-mod)); follows `/model` switches
3. **Model family** of the latest main-chain transcript entry — Opus / Fable → 1,000,000; Sonnet / Haiku → 250,000
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

### Window probe (mod)

Command hooks are never told the session's model or context window, but function hooks can ask the engine. `hooks/window-probe.ts` is a function-hook module (listed under `modules` in `hooks.json`) that reads `$.session.usage().context.window` and writes it to `${TMPDIR}/context-monitor/<session-id>.window.json`:

```json
{ "window": 1000000, "model": "claude-opus-5-5", "updatedAt": 1791304339540 }
```

It refreshes on session start, at the start of every turn (so a model picked between turns is cached before that turn's `PostToolUse` / `Stop` hooks run) and after a compaction. On Claude Code builds without function-hook support the module simply doesn't load, and the command hook falls back to the model-family map.

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
│   ├── context-monitor.mjs   ← vendored single-file bundle (committed)
│   └── window-probe.ts       ← function-hook module, loaded by the engine as-is
├── src/context-monitor.ts    ← source for the bundle
├── tests/window-probe.test.ts
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

# window-probe mod
npm run test:mod        # claude plugin test .
npm run typecheck:mod   # needs .claude-plugin/types/, which Claude Code writes the
                        # first time it loads the plugin (e.g. claude --plugin-dir .)
```

The bundle targets Node 20+ ESM. It runs under any Claude Code installation since Node is the host runtime.

## State

Per-session counters live at `${TMPDIR}/context-monitor/<session-id>.json`. They're best-effort: a missing or unreadable state file just means the next invocation starts cold.
