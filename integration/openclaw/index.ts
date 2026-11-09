import { Type } from 'typebox';
import { defineToolPlugin } from 'openclaw/plugin-sdk/tool-plugin';
import type { OpenClawPluginToolContext } from 'openclaw/plugin-sdk/plugin-entry';
import { SqliteStore } from '../../src/sqlite-store.ts';
import { Memory } from '../../src/memory.ts';
import { previewBriefing } from '../../src/briefing.ts';
import { quietAt } from '../../src/quiet-hours.ts';

const parameters = Type.Object({}, { additionalProperties: false });
const configSchema = Type.Object({
  syntheticOnly: Type.Literal(true),
  databasePath: Type.String({ minLength: 1, maxLength: 4096 }),
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
  clockMs: Type.Integer({ minimum: 0, maximum: 8640000000000000 }),
  timeZone: Type.String({ minLength: 1, maxLength: 100 }),
  start: Type.String({ pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' }),
  end: Type.String({ pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' }),
}, { additionalProperties: false });
const outputSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), preview: Type.Object({
    text: Type.String({ maxLength: 65536 }), shown: Type.Integer({ minimum: 0, maximum: 20 }),
    omitted: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }) }, { additionalProperties: false }),
  Type.Object({ ok: Type.Literal(false), error: Type.Union([
    Type.Literal('DENIED'), Type.Literal('INVALID_INPUT'), Type.Literal('UNAVAILABLE'),
    Type.Literal('INVALID_POLICY'), Type.Literal('CLOCK_BEHIND'), Type.Literal('OUTPUT_LIMIT'),
  ]) }, { additionalProperties: false }),
]);
type Code = 'DENIED' | 'INVALID_INPUT' | 'UNAVAILABLE' | 'INVALID_POLICY' | 'CLOCK_BEHIND' | 'OUTPUT_LIMIT';
const failure = (error: Code) => ({ ok: false as const, error });
function authorized(ctx: OpenClawPluginToolContext, agentId: string) {
  if (ctx.senderIsOwner !== true || ctx.agentId !== agentId ||
      ctx.memoryAudience?.kind !== 'owner-private' || ctx.memoryAudience.agentId !== agentId ||
      typeof ctx.assertInvocationCurrent !== 'function' || typeof ctx.assertMemoryAudienceCurrent !== 'function') {
    throw new Error('DENIED');
  }
  ctx.assertInvocationCurrent(); ctx.assertMemoryAudienceCurrent();
}
export default defineToolPlugin({
  id: 'alfred-readonly', name: 'Alfred synthetic read-only preview',
  description: 'Isolated synthetic evaluation only. No sends, reservations or writes.',
  configSchema,
  tools: tool => (['alfred_briefing_preview', 'alfred_reminder_eligibility'] as const).map(name => tool({
    name, description: 'Read a bounded synthetic preview. Takes no arguments.',
    parameters, optional: true, workspaceAccess: false,
    factory: ({ config, toolContext }) => ({
      name, label: name, description: 'Read-only synthetic preview', parameters, outputSchema,
      hideFromChannelProgress: true,
      async execute(_callId, args, signal) {
        const reply = (details: object) => ({ content: [{ type: 'text' as const, text: JSON.stringify(details) }], details });
        try { authorized(toolContext, config.agentId); signal?.throwIfAborted(); }
        catch { return reply(failure('DENIED')); }
        if (!args || typeof args !== 'object' || Array.isArray(args) ||
            ![Object.prototype, null].includes(Object.getPrototypeOf(args)) || Reflect.ownKeys(args).length !== 0) {
          return reply(failure('INVALID_INPUT'));
        }
        if (config.syntheticOnly !== true) return reply(failure('DENIED'));
        const policy = { timeZone: config.timeZone, start: config.start, end: config.end };
        try { quietAt(policy, config.clockMs); } catch { return reply(failure('INVALID_POLICY')); }
        let store: SqliteStore | undefined;
        let details: object;
        try {
          store = SqliteStore.open(config.databasePath, { readOnly: true });
          const snapshot = store.load();
          const briefing = previewBriefing({ load: () => snapshot }, config.clockMs);
          if (!briefing.ok) {
            details = failure(briefing.code === 'CLOCK_BEHIND' ? 'CLOCK_BEHIND' : 'UNAVAILABLE');
          } else if (name === 'alfred_briefing_preview') {
            details = { ok: true, preview: { text: briefing.text, shown: briefing.shown, omitted: briefing.omitted } };
          } else {
            const memory = new Memory({ load: () => snapshot, transact: () => { throw new Error('READ_ONLY'); } });
            const entries = memory.eligibilityPreview(config.clockMs, policy);
            const visible = entries.slice(0, 20);
            details = { ok: true, preview: { text: JSON.stringify(visible), shown: visible.length, omitted: entries.length - visible.length } };
          }
          if (Buffer.byteLength(JSON.stringify(details)) > 65536) details = failure('OUTPUT_LIMIT');
        } catch { details = failure('UNAVAILABLE'); }
        finally { try { store?.close(); } catch { details = failure('UNAVAILABLE'); } }
        // Recheck after work, immediately before releasing even synthetic owner data.
        try { authorized(toolContext, config.agentId); signal?.throwIfAborted(); }
        catch { return reply(failure('DENIED')); }
        return reply(details!);
      },
    }),
  })),
});
