# Worktree verification

Run the suite from this package directory with `node --test`, or use `pnpm --filter @agou/dsh-worktrees test` from the repository root.

The native transport and Open in App tests need an installed DSH runtime. Set `DSH_TEST_RUNTIME` to the `@deepseek-ai` scope directory containing the runtime's `cordis`, `dsh-client-connection` and `dsh-client-ui-open-in-app` packages:

```powershell
$env:DSH_TEST_RUNTIME = 'C:\path\to\DSH\node_modules\@deepseek-ai'
node --test
```

Without this variable, the native runtime cases report explicit skips. They must run before changing the supported DSH version.

UI messages are authored in [en.json](../locale/en.json) and [zh.json](../locale/zh.json). After editing them, run `pnpm locales` from the package directory to update the checked-in client dictionary. `pnpm locales:check` verifies matching keys, placeholders and generated content without writing. Installation uses the checked-in JavaScript directly.

## Coverage and boundaries

- [manager.test.js](manager.test.js) uses real Git repositories and files for allocation, default branch selection, checkout failures, snapshots, recovery, protection, retention and disposal. Platform-specific filesystem cases are conditional on the platform.
- [bridge.test.js](bridge.test.js) uses the real Host adapter, manager, Git and filesystem. DSH services and event registration are external boundaries represented by fixtures. It checks accepted-message ordering, strict tool arguments, approval decisions, native event wiring and directory guards.
- [client.test.js](client.test.js) runs the actual client module in a VM. React rendering, UI primitives, Connection and browser timers are boundary doubles. It checks send sequencing, draft outcomes, cancellation, sidebars, polling and teardown. It does not establish actual menu geometry, focus behavior or the native composer's attachment restoration.
- [open-in.test.js](open-in.test.js) runs the installed native Open in App module together with the plugin. React, snapshot stores, Slot registration and HTTP are explicit boundaries. It checks per-session launch targets, missing projections, native app choice and errors, and adapter registration lifetimes. It does not establish SlotCore selection, Cordis ownership or DOM behavior; verify those in the installed Web GUI.
- [discovery.test.js](discovery.test.js) uses real linked checkouts and native session-summary fixtures. It checks read-only grouping, managed exclusions, caching, bounded scans, cancellation and observable failures.
- [runtime.test.js](runtime.test.js) uses the installed Cordis Context, Connection, Peer and exact route dispatcher. Authentication, the HTTP carrier and Host business operations are boundary doubles. It checks route ownership, disposal, reactivation, admission and protocol envelopes without requiring a WebServer injection.

## Browser verification

Install the package into the intended DSH profile and refresh its existing Web GUI. Use an isolated Git repository and identify every test-owned session and checkout before modifying or removing anything.

Check the native menu order and keyboard behavior, immediate Local checkout, and absence of allocation or remembered choices from menu clicks. Send through the actual composer to verify detached creation and accepted-message memory. Exercise a failed preparation with text and an attachment, then confirm both remain available and the error appears in a global dialog.

Check the managed inventory and the sidebar in grouped and single-list views, including coexistence with workspace labels. Check hover contrast in light and dark themes and the icon beside the flat-list branch line. Confirm both Git selectors are disabled for a directory outside any repository, while a Local conversation remains usable. Preserve the global directory and retention target during verification in a profile containing other users' work.

For the native header, use two conversations sharing one source repository but different current directories. Check both the default open button and an alternate application, including a fresh page load. Capture the outgoing launch paths at the external application boundary if launching an editor would disturb another workspace. Restore the original application choice. The native workspace keyboard shortcut has a separate target resolver and is outside this header adapter.

For recovery, modify only a test-owned checkout, delete it through the plugin, and reopen its conversation history. Opening history must leave files absent. Verify that cancelling the send-time Restore dialog retains text and attachments, then confirm restoration of tracked and nonignored untracked bytes at the same path. Ignored files are excluded. Archive the test conversations afterward; retain their source Git repository while their recovery snapshots are retained.
