/**
 * window-probe — function-hook half of context-monitor.
 *
 * Command hooks never see the session's model or context window, but the
 * engine does: `$.session.usage().context.window` is the live window of the
 * current model (the status line's `context_window_size`), and it follows
 * `/model` switches. This module caches it where the command hook reads it:
 *
 *   <os tmpdir>/context-monitor/<session-id>.window.json
 *     { "window": 1000000, "model": "claude-opus-5-5", "updatedAt": 1759766400000 }
 *
 * It refreshes on session start, at the start of every turn (so a model picked
 * between turns is cached before that turn's PostToolUse / Stop hooks run) and
 * after a compaction.
 */
import type { EngineInterface, Register } from 'claude-code';

const STATE_DIR_NAME = 'context-monitor';

/** Mirrors Node's `os.tmpdir()`, which the command hook uses for the same folder. */
async function tmpdir($: EngineInterface, isWindows: boolean): Promise<string> {
    const dir = isWindows
        ? ((await $.env.get('TEMP')) ??
          (await $.env.get('TMP')) ??
          `${(await $.env.get('SystemRoot')) ?? 'C:\\Windows'}\\temp`)
        : ((await $.env.get('TMPDIR')) ?? (await $.env.get('TMP')) ?? (await $.env.get('TEMP')) ?? '/tmp');
    return dir.length > 1 && /[\\/]$/.test(dir) && !/^[A-Za-z]:\\$/.test(dir) ? dir.slice(0, -1) : dir;
}

async function cacheWindow($: EngineInterface): Promise<void> {
    try {
        const [usage, model, sessionId] = await Promise.all([$.session.usage(), $.session.model(), $.session.id()]);
        const safe = sessionId.replace(/[^a-zA-Z0-9-]/g, '_');
        const isWindows = (await $.env.get('OS')) === 'Windows_NT';
        const path = [await tmpdir($, isWindows), STATE_DIR_NAME, `${safe}.window.json`].join(isWindows ? '\\' : '/');
        const updatedAt = await $.clock.now();
        await $.fs.write(path, JSON.stringify({ window: usage.context.window, model, updatedAt }));
    } catch {
        // best effort; without the cache the command hook falls back to the model map
    }
}

export const register: Register = (on) => {
    on('session.start', async ($, e, next) => {
        const result = await next(e);
        await cacheWindow($);
        return result;
    });

    on('turn.start', async ($, e, next) => {
        await cacheWindow($);
        return next(e);
    });

    on('session.compact', async ($, e, next) => {
        const result = await next(e);
        await cacheWindow($);
        return result;
    });
};
