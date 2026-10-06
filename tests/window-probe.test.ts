import { expect, mock, test } from 'claude-code/testing';
import type { On } from 'claude-code';

/** Stands in for the engine beneath the mod and records what it writes. */
function engine(on: On, window: number, env: Record<string, string>) {
    const writes: { path: string; text: string }[] = [];
    mock.env(on, env);
    mock.clock(on, { now: 1234 });
    on('session.usage', () => ({ value: { startedAt: 0, context: { window }, rateLimits: [] } }));
    on('session.model', () => ({ value: 'claude-opus-5-5' }));
    on('session.id', () => ({ value: 'abc-123:x' }));
    on('fs.write', (_$, e) => {
        writes.push({ path: e.path, text: e.text });
        return { value: undefined };
    });
    on('turn.start', (_$, e) => ({ turnId: e.turnId }));
    return writes;
}

test('caches the live window under the Windows temp dir at turn start', async ($, on) => {
    const writes = engine(on, 1_000_000, { OS: 'Windows_NT', TEMP: 'C:\\Users\\k\\AppData\\Local\\Temp\\' });
    await $.turn.start({ text: 'hi', turnId: 't1' });
    expect(writes).toEqual([
        {
            path: 'C:\\Users\\k\\AppData\\Local\\Temp\\context-monitor\\abc-123_x.window.json',
            text: JSON.stringify({ window: 1_000_000, model: 'claude-opus-5-5', updatedAt: 1234 }),
        },
    ]);
});

test('uses TMPDIR, then /tmp, off Windows', async ($, on) => {
    const writes = engine(on, 200_000, { TMPDIR: '/var/folders/xy/T/' });
    await $.turn.start({ text: 'hi', turnId: 't1' });
    // A Windows test host resolves the POSIX path onto its own drive before fs.write sees it.
    expect(writes[0]?.path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')).toBe(
        '/var/folders/xy/T/context-monitor/abc-123_x.window.json',
    );
});
