window.__ModuleLoader__.load({
  id: 'dsh-model-effort-memory',
  factory(require) {
    const { ModelDirectory } = require('@deepseek-ai/dsh-client-ui-model-selection');
    const PREFIX = 'dsh-model-effort-memory:';

    return {
      inject: ['modelDirectories'],
      apply(ctx) {
        const memory = new Map();
        const keyOf = ({ provider, model }) => `${PREFIX}${JSON.stringify([provider, model])}`;

        function saved(selection) {
          const key = keyOf(selection);
          if (memory.has(key)) return { effort: memory.get(key) };
          try {
            const raw = window.localStorage.getItem(key);
            if (raw === null) return undefined;
            const value = JSON.parse(raw);
            if (value !== null && typeof value === 'object' && !Array.isArray(value)
              && Object.hasOwn(value, 'effort')
              && (value.effort === null || (typeof value.effort === 'string' && value.effort.length > 0))) {
              memory.set(key, value.effort);
              return { effort: value.effort };
            }
            console.warn('[dsh-model-effort-memory] Ignoring invalid saved effort:', key);
          } catch (error) {
            console.warn('[dsh-model-effort-memory] Could not read saved effort:', error);
          }
          return undefined;
        }

        function remember(selection, effort) {
          const key = keyOf(selection);
          memory.set(key, effort);
          try {
            window.localStorage.setItem(key, JSON.stringify({ effort }));
          } catch (error) {
            console.warn('[dsh-model-effort-memory] Could not save effort; using memory:', error);
          }
        }

        function reasoningFor(groups, selection) {
          return groups.find((group) => group.id === selection.provider)
            ?.models.find((model) => model.id === selection.model)?.reasoning;
        }

        ctx.effect(() => {
          const original = ModelDirectory.prototype.select;
          async function selectWithMemory(selection) {
            const previous = this.store.getSnapshot().current;
            const sameModel = previous?.provider === selection.provider && previous.model === selection.model;
            let next = selection;
            if (!sameModel) {
              const savedEffort = saved(selection);
              const reasoning = reasoningFor(this.store.getSnapshot().groups, selection);
              if (reasoning && savedEffort !== undefined
                && (savedEffort.effort === null
                  ? reasoning.defaultEffort === undefined
                  : reasoning.efforts.some((level) => level.id === savedEffort.effort))) {
                next = { ...selection };
                if (savedEffort.effort === null) delete next.reasoningEffort;
                else next.reasoningEffort = savedEffort.effort;
              }
            }

            const result = await original.call(this, next);
            if (!result?.ok) return result;
            if (sameModel) remember(selection, selection.reasoningEffort ?? null);
            else if (previous !== null && saved(previous) === undefined) {
              remember(previous, previous.reasoningEffort ?? null);
            }
            return result;
          }
          ModelDirectory.prototype.select = selectWithMemory;
          return () => {
            if (ModelDirectory.prototype.select === selectWithMemory) {
              ModelDirectory.prototype.select = original;
            }
          };
        });
      },
    };
  },
});
