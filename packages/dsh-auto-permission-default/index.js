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
  return ctx.on('session/created', (session) => {
    const presets = ctx.permissionPresets;
    if (!presets.names.includes('auto')) return;
    if (session.header.origin === 'subagent') return;
    if (presets.current(session) !== presets.defaultPreset) return;
    presets.set(session, 'auto');
  });
}
