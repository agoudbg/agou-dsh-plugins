window.__ModuleLoader__.load({
  id: 'dsh-menu-search',
  factory(require) {
    /**
     * Search field for native DSH menus.
     *
     * The shipped `Menu` renders a panel of `[data-menu-material][role="menu"]`
     * whose children are a translucent material layer, a scrollable viewport of
     * menuitem rows, and an optional footer. This module leaves every one of
     * those nodes and their styles untouched: it inserts one extra sibling row
     * between the material layer and the viewport, and hides non-matching rows
     * by toggling their own `display`/`disabled` state.
     *
     * Only menus whose trigger is listed in `TRIGGER_SELECTORS` (or that opts in
     * with a `data-menu-search-trigger` attribute) are decorated, so the many
     * other menus in the page keep their shipped behavior.
     */
    const NS = 'menu-search';
    const PREFIX = 'dsh-menu-search';
    const PANEL_SELECTOR = '[data-menu-material][role="menu"]';
    const TRIGGER_SELECTOR = '[aria-haspopup="menu"]';
    const OPT_IN_ATTRIBUTE = 'data-menu-search-trigger';
    // A menu needs at least two entries before filtering is useful.
    const MIN_ITEMS = 2;
    // Frames to keep retrying while a panel's trigger state or entry list is
    // still arriving.
    const RETRY_FRAMES = 60;
    const SEARCH_ICON = 'dsw-icon-search-outline-regular';

    /**
     * Menus that gain the search field.
     *
     * Selectors rely on stable hooks rather than CSS-module hashes: `data-slot`
     * attributes come from the shared slot registry, `heroWorkspaceRow` is the
     * layout class name minus its generated hash, and `dsh-worktrees-seat` is
     * this repository's own class.
     */
    const TRIGGER_SELECTORS = [
      // Workspace picker in the conversation composer.
      '[class*="heroWorkspaceRow"] > button[aria-haspopup="menu"]',
      // Work mode (agent preset) picker next to it.
      '[data-slot="conversation.hero.agentPreset"] button[aria-haspopup="menu"]',
      // dsh-worktrees branch picker. Only the second seat qualifies: the first
      // one switches between a local and a new worktree, which is two entries
      // the user already sees at a glance.
      '[data-slot="conversation.hero.options"] > .dsh-worktrees-anchor:last-child > button.dsh-worktrees-seat',
    ];

    const CSS = [
      /* Search row: same 8px inline padding as a menuitem, so the icon lines up
         with the item icons and the text with the item labels. */
      `[data-menu-search="row"] {
  box-sizing: border-box;
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 3px;
  margin-bottom: 3px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}`,
      `[data-menu-search="icon"] {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
}`,
      `[data-menu-search="input"] {
  flex: 1 1 auto;
  width: 0;
  min-width: 0;
  height: 20px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
}`,
      `[data-menu-search="input"]::placeholder {
  color: var(--dsw-alias-label-tertiary);
}`,
      `[data-menu-search="empty"] {
  padding: 6px 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}`,
    ].join('\n');

    /** Builds the extra row and wires it to the panel it belongs to. */
    function decoratePanel(panel, translate) {
      const viewport = [...panel.children].find((child) => child.getAttribute('role') === 'presentation');
      if (!viewport) return null;
      const items = [...viewport.querySelectorAll('button[role="menuitem"]')];
      if (items.length < MIN_ITEMS) return null;

      const row = document.createElement('div');
      row.setAttribute('data-menu-search', 'row');
      row.setAttribute('role', 'none');

      // Hiding rows would otherwise shrink the panel under the user's cursor.
      // The floor lives on this module's own row, so the panel's style stays
      // untouched. It is re-measured until the panel has a real layout.
      let widthFloor = 0;
      const pinWidth = () => {
        if (widthFloor > 0) return;
        const measured = viewport.getBoundingClientRect().width;
        if (measured <= 0) return;
        widthFloor = measured;
        row.style.width = `${measured.toFixed(2)}px`;
      };

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '14');
      svg.setAttribute('height', '14');
      svg.setAttribute('data-menu-search', 'icon');
      svg.setAttribute('data-icon', SEARCH_ICON);
      svg.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#${SEARCH_ICON}`);
      svg.appendChild(use);

      const input = document.createElement('input');
      input.setAttribute('data-menu-search', 'input');
      input.setAttribute('type', 'text');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('aria-label', translate('search'));
      input.placeholder = translate('search');

      row.append(svg, input);

      const empty = document.createElement('div');
      empty.setAttribute('data-menu-search', 'empty');
      empty.textContent = translate('empty');
      empty.style.display = 'none';

      const material = panel.querySelector('[class*="_material_"]');
      if (material) material.insertAdjacentElement('afterend', row);
      else panel.insertBefore(row, viewport);
      viewport.appendChild(empty);

      // Snapshot the shipped disabled state once, before this module touches it.
      const originalDisabled = new Map(
        items.map((button) => [button, button.disabled]),
      );
      const hide = (child, button) => {
        if (child.style.display !== 'none') child.style.display = 'none';
        if (!button) return;
        button.disabled = true;
        button.setAttribute('aria-hidden', 'true');
      };
      const show = (child, button) => {
        if (child.style.display !== '') child.style.display = '';
        if (!button) return;
        const restored = originalDisabled.get(button) ?? false;
        if (button.disabled !== restored) button.disabled = restored;
        button.removeAttribute('aria-hidden');
      };

      const applyFilter = () => {
        const query = input.value.trim().toLowerCase();
        pinWidth();
        let matches = 0;
        for (const child of viewport.children) {
          if (child.hasAttribute('data-menu-search')) continue;
          const button = child.querySelector('button[role="menuitem"]');
          if (!button) {
            // Separators and group labels follow the list: hide them while a
            // query is active, restore them when it is cleared.
            if (child.style.display !== (query ? 'none' : '')) child.style.display = query ? 'none' : '';
            continue;
          }
          const hit = query === '' || (button.textContent ?? '').toLowerCase().includes(query);
          if (hit) matches += 1;
          if (hit) show(child, button);
          else hide(child, button);
        }
        empty.style.display = query !== '' && matches === 0 ? '' : 'none';
        viewport.scrollTop = 0;
      };

      input.addEventListener('input', applyFilter);
      input.addEventListener('keydown', (event) => {
        if (event.isComposing) return;
        if (event.key !== 'Enter') return;
        const first = [...viewport.querySelectorAll('button[role="menuitem"]')]
          .find((button) => !button.disabled && button.offsetParent !== null);
        if (!first) return;
        event.preventDefault();
        first.click();
      });

      const focusInput = () => {
        try {
          input.focus({ preventScroll: true });
        } catch (error) {
          console.warn(`[${PREFIX}] Could not focus the search field:`, error);
          input.focus();
        }
      };
      focusInput();
      // The shipped menu may move focus to its first item on the next frame;
      // reclaim it only while nothing else owns focus.
      requestAnimationFrame(() => {
        if (!panel.isConnected || document.activeElement === input) return;
        const active = document.activeElement;
        if (active === null || active === document.body) focusInput();
      });

      return { input, applyFilter };
    }

    /**
     * Arrow keys walk the search field and the entries as one cycle. The
     * shipped roving focus only knows the entries, and only while focus is on
     * its trigger or inside its viewport, so the two edge steps across the
     * boundary are taken here; every step inside the list stays native.
     */
    const visibleItems = (viewport) => [...viewport.querySelectorAll('button[role="menuitem"]')]
      .filter((button) => !button.disabled && button.offsetParent !== null);

    const moveFocus = (element) => {
      try {
        element.focus({ preventScroll: true });
      } catch (error) {
        console.warn(`[${PREFIX}] Could not move focus in the menu:`, error);
        element.focus();
      }
    };

    const onArrowKey = (event) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const forward = event.key === 'ArrowDown';
      if (!forward && event.key !== 'ArrowUp') return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const panel = target.closest('[data-menu-search="panel"]');
      if (!panel || !panel.isConnected) return;
      const viewport = [...panel.children].find((child) => child.getAttribute('role') === 'presentation');
      const input = panel.querySelector('[data-menu-search="input"]');
      if (!viewport || !input) return;
      const items = visibleItems(viewport);
      if (items.length === 0) return;
      const entry = items.indexOf(target.closest('button[role="menuitem"]'));
      const atEdge = target === input || (forward ? entry === items.length - 1 : entry === 0);
      if (!atEdge) return;
      let destination;
      if (target === input) destination = forward ? items[0] : items[items.length - 1];
      else destination = input;
      event.preventDefault();
      event.stopImmediatePropagation();
      moveFocus(destination);
    };

    return {
      inject: ['locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', {
          search: 'Search',
          empty: 'No matching items',
        }));
        ctx.effect(() => ctx.locale.register(NS, 'zh', {
          search: '搜索',
          empty: '没有匹配项',
        }));
        const translate = ctx.locale.bind(NS);
        ctx.effect(() => {
          const style = document.createElement('style');
          style.setAttribute('data-plugin', PREFIX);
          style.textContent = CSS;
          document.head.appendChild(style);

          const decorated = new WeakSet();
          // Panel input -> its filter, so the shared key handler can reach it.
          const filters = new WeakMap();
          const pending = new Map();
          let disposed = false;

          const matchesWhitelist = (trigger) => {
            if (!trigger || !trigger.isConnected) return false;
            if (trigger.closest(`[${OPT_IN_ATTRIBUTE}]`)) return true;
            for (const selector of TRIGGER_SELECTORS) {
              try {
                if (trigger.closest(selector)) return true;
              } catch (error) {
                console.warn(`[${PREFIX}] Ignoring invalid trigger selector "${selector}":`, error);
              }
            }
            return false;
          };

          /**
           * The menu panel is portalled away from its trigger, so the opener is
           * read from the trigger that reports itself expanded. Nothing else
           * identifies it: remembering the last clicked trigger would let an
           * unrelated menu opened right afterwards inherit the field.
           *
           * The shipped menu engine keeps one menu open at a time, so exactly
           * one trigger is expanded while a panel is on screen. Any other count
           * means the opening state is mid-transition and the panel is looked at
           * again later.
           */
          const expandedTriggers = () => [...document.querySelectorAll(`${TRIGGER_SELECTOR}[aria-expanded="true"]`)];

          const resolveTrigger = () => {
            const expanded = expandedTriggers();
            if (expanded.length !== 1) return { state: 'wait' };
            const [trigger] = expanded;
            return matchesWhitelist(trigger) ? { state: 'open', trigger } : { state: 'foreign' };
          };

          /**
           * Decides what to do with a panel:
           *
           * - `done`: decorated, or proven not to belong to a whitelisted menu.
           * - `wait`: the opening state may still be arriving, or the entry list
           *   has not been rendered yet, so looking again on a later frame can
           *   help.
           *
           * A menu that mounts before its trigger reports expanded is retried,
           * which is what covers the branch list that loads after the panel
           * opens. A menu mounted under a different expanded trigger is settled
           * at once, which is what keeps an unrelated menu opened right after a
           * decorated one from inheriting the field.
           */
          const attempt = (panel) => {
            if (!panel || decorated.has(panel)) return 'done';
            // A context menu and a submenu share the material/role surface but
            // belong to their own trigger, not to a whitelisted one.
            if (panel.hasAttribute('data-context-menu')) return 'done';
            if ([...panel.classList].some((name) => name.includes('_submenu_'))) return 'done';
            const resolved = resolveTrigger();
            if (resolved.state === 'wait') return 'wait';
            if (resolved.state !== 'open') return 'done';
            const wiring = decoratePanel(panel, translate);
            // A whitelisted menu whose entries are still loading.
            if (!wiring) return 'wait';
            decorated.add(panel);
            panel.setAttribute('data-menu-search', 'panel');
            filters.set(wiring.input, wiring.applyFilter);
            return 'done';
          };

          const decorate = (panel) => {
            if (!panel || disposed || decorated.has(panel) || pending.has(panel)) return;
            if (attempt(panel) === 'done') return;
            // Keep trying while the panel is on screen: the trigger state and
            // the entry list arrive in their own time, and a panel that is
            // closed before either lands simply stops being retried.
            let frames = 0;
            const tick = () => {
              if (disposed || !panel.isConnected) { pending.delete(panel); return; }
              if (attempt(panel) === 'done' || frames++ >= RETRY_FRAMES) { pending.delete(panel); return; }
              pending.set(panel, requestAnimationFrame(tick));
            };
            pending.set(panel, requestAnimationFrame(tick));
          };

          const scan = (node) => {
            if (node.matches?.(PANEL_SELECTOR)) decorate(node);
            for (const panel of node.querySelectorAll?.(PANEL_SELECTOR) ?? []) decorate(panel);
            decorate(node.closest?.(PANEL_SELECTOR) ?? null);
          };

          const observer = new MutationObserver((records) => {
            for (const record of records) {
              for (const node of record.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) scan(node);
              }
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });

          /**
           * Escape clears an active query before it closes the menu. The shipped
           * handler closes the menu from a `document` capture listener, so this
           * one has to sit earlier in the path: `window`, capture phase.
           */
          const onKeyDown = (event) => {
            if (event.isComposing) return;
            if (event.key === 'Escape') {
              const target = event.target;
              if (!(target instanceof Element)) return;
              const input = target.closest('[data-menu-search="input"]');
              if (!input || input.value === '') return;
              const applyFilter = filters.get(input);
              if (!applyFilter) return;
              event.preventDefault();
              event.stopImmediatePropagation();
              input.value = '';
              applyFilter();
              return;
            }
            onArrowKey(event);
          };

          window.addEventListener('keydown', onKeyDown, true);

          return () => {
            disposed = true;
            pending.clear();
            observer.disconnect();
            window.removeEventListener('keydown', onKeyDown, true);
            style.remove();
          };
        });
      },
    };
  },
});
