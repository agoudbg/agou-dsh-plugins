/**
 * Selects the Auto review permission preset for every newly created
 * interactive session, because the permission-presets service deliberately
 * cannot name the runtime-registered "auto" preset as its durable default.
 *
 * A session whose effective preset already differs from the configured
 * default (an explicit human or stored selection) is left untouched, and
 * subagent sessions are skipped entirely.
 *
 * @module dsh-auto-permission-default
 */

/** Complete host services required before the plugin may operate. */
export const inject = ['permissionPresets'];

/** Switch each newly created interactive session to the Auto review preset. */
export function apply(ctx) {
  // Runs on `agent/created` instead of `session/created`: since dsh 0.2.2-rc.1 a
  // session rejects appends until its `session/created` announcement completes,
  // and `presets.set` appends. The serial `agent/created` phase runs after that
  // announcement on every supported dsh version, so the append is safe there.
  // `startup` filters to fresh creations; resumed, cleared, and compacted
  // agents keep whatever preset their session already carries.
  return ctx.on('agent/created', ({ agent, source }) => {
    if (source !== 'startup') return;
    const presets = ctx.permissionPresets;
    if (!presets.names.includes('auto')) return;
    const session = agent.session;
    if (session.header.origin === 'subagent') return;
    if (presets.current(session) !== presets.defaultPreset) return;
    presets.set(session, 'auto');
  });
}
