# context-monitor

A single-purpose Claude Code plugin that watches per-session context usage and warns the user before quality degrades.

It does one thing: read the live token count out of the transcript, count how many auto-compactions have happened, and emit a tiered notification when either crosses a threshold. Output is rendered with [`@aeriondyseti/plugin-kit`](https://github.com/aeriondyseti/plugin-kit).

## What it watches

| Signal               | Note                          | Warn   | Strong  | Critical |
| -------------------- | ----------------------------- | ------ | ------- | -------- |
| Context size (tokens) | latest main-chain transcript entry | 100k | 150k | 200k |
| Compactions          | counted via `SessionStart` (matcher: `compact`) | 2 | 4 | 6 |

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
┌─ · Session health warning ──────────────────────────────────┐
│ ⚠ Context size is 175,000 tokens (compression approaching) │
└─────────────────────────────────────────────────────────────┘
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

## Releasing

Always release with [plugin-kit](https://github.com/aeriondyseti/plugin-kit)'s `release` command. It bumps the version, tags the release, and pins this plugin's entry in the [aeriondyseti-plugins](https://github.com/aeriondyseti/aeriondyseti-plugins) marketplace to that exact tag and commit in one step, so the published plugin never drifts from this repo. Don't bump versions, create tags, or edit the marketplace entry by hand.

Before step 1, rebuild the bundle (`npm run typecheck && npm run build`) and commit `hooks/context-monitor.mjs`: users run the committed bundle, not `src/`.

1. Add your changes under `## [Unreleased]` in `CHANGELOG.md` and commit them. `release` refuses to run with an empty `[Unreleased]` section or a dirty tree.
2. Optionally run `npx @aeriondyseti/plugin-kit doctor` to catch anything that would break the plugin once installed.
3. From this repo, with the marketplace repo cloned alongside it (adjust the path if yours lives elsewhere), preview and then release:

   ```bash
   npx @aeriondyseti/plugin-kit release patch --plugin . --marketplace ../aeriondyseti-plugins/.claude-plugin/marketplace.json --dry-run
   npx @aeriondyseti/plugin-kit release patch --plugin . --marketplace ../aeriondyseti-plugins/.claude-plugin/marketplace.json
   ```

   Use `patch`, `minor`, `major`, or an explicit `x.y.z`. This bumps `.claude-plugin/plugin.json` and `package.json` (plus `package-lock.json`), moves `[Unreleased]` under the new version in `CHANGELOG.md`, commits `Release x.y.z`, tags `vx.y.z`, and updates `ref`, `sha`, and `version` in the marketplace entry. It never pushes.
4. Push this repo first: `git push origin main --follow-tags`.
5. Then commit and push the marketplace change. Pushing it first would pin a commit GitHub doesn't have yet, and installs would fail.

## State

Per-session counters live at `${TMPDIR}/context-monitor/<session-id>.json`. They're best-effort: a missing or unreadable state file just means the next invocation starts cold.
