window.__ModuleLoader__.load({
  id: 'dsh-pasted-text-file',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'pasted-text-file';
    const SLOT = 'conversation.input.attachments';
    const PREFIX = 'dsh-pasted-text';
    const LIMIT = 5000;
    const CSS = `
.${PREFIX}-rail { display:flex; flex-wrap:wrap; gap:8px; min-width:0; padding:2px 10px 4px; }
.${PREFIX}-rail:empty { display:none; }
.${PREFIX}-file { display:flex; align-items:center; gap:10px; box-sizing:border-box; width:250px; max-width:100%; min-height:64px; padding:10px 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font-size:13px; line-height:18px; }
.${PREFIX}-badge { flex:none; color:var(--dsw-alias-label-secondary); font-size:11px; }
.${PREFIX}-body { flex:1; min-width:0; }
.${PREFIX}-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.${PREFIX}-status { color:var(--dsw-alias-label-secondary); font-size:12px; }
.${PREFIX}-link, .${PREFIX}-remove { border:0; background:transparent; font:inherit; cursor:pointer; }
.${PREFIX}-link { padding:0; color:var(--dsw-alias-brand-primary); text-decoration:underline; text-underline-offset:2px; }
.${PREFIX}-remove { flex:none; padding:4px; color:var(--dsw-alias-label-secondary); font-size:18px; line-height:18px; border-radius:4px; }
.${PREFIX}-remove:hover { background:var(--dsw-alias-bg-layer-2); }
.${PREFIX}-link:focus-visible, .${PREFIX}-remove:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:3px; }
.${PREFIX}-link:disabled, .${PREFIX}-remove:disabled { opacity:.5; cursor:default; }
.${PREFIX}-image { position:relative; }
.${PREFIX}-image > .${PREFIX}-remove { position:absolute; top:0; right:0; background:var(--dsw-alias-bg-layer-1); }
.${PREFIX}-error { color:var(--dsw-alias-state-error-primary); font-size:12px; line-height:18px; }
.${PREFIX}-drop { position:fixed; inset:16px; z-index:1000; display:grid; place-items:center; border:2px dashed var(--dsw-alias-brand-primary); border-radius:16px; background:var(--dsw-alias-bg-overlay); color:var(--dsw-alias-label-primary); pointer-events:none; }
`;

    // Count Unicode code points, stopping as soon as the threshold is crossed.
    function isLongText(text) {
      let count = 0;
      for (const character of text) {
        if (character !== '' && ++count > LIMIT) return true;
      }
      return false;
    }

    function fileBatch(dataTransfer) {
      const files = [];
      const directories = new Set();
      for (const item of dataTransfer.items) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (file === null) continue;
        files.push(file);
        if (item.webkitGetAsEntry?.()?.isDirectory) directories.add(file);
      }
      if (files.length === 0) files.push(...dataTransfer.files);
      return { files, directories };
    }

    function sizeText(bytes) {
      return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    }

    // Previews already have browser-owned URLs, so the gallery never needs a Host read.
    const noImageRead = () => Promise.reject(new Error('A draft image must have a preview URL.'));

    return {
      inject: ['slots', 'locale'],
      async apply(ctx) {
        const dictionaries = await require.async('./client.locales.js');
        ctx.effect(() => ctx.locale.register(NS, dictionaries));

        // File identity distinguishes generated pastes from ordinary files with the same name.
        // Weak keys release the original text with the browser's attachment object.
        const pasted = new WeakMap();
        const sequences = new Map();

        function nextFileName(sessionId, t, takenNames) {
          const storageKey = `dsh-pasted-text-file:sequence:${sessionId}`;
          let sequence = sequences.get(sessionId) ?? 0;
          try {
            const stored = window.localStorage.getItem(storageKey);
            if (stored !== null) {
              const value = Number(stored);
              if (Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER) {
                sequence = Math.max(sequence, value);
              } else {
                console.warn('[dsh-pasted-text-file] Invalid saved filename sequence:', stored);
              }
            }
          } catch (failure) {
            console.warn('[dsh-pasted-text-file] Could not read filename sequence; using memory:', failure);
          }
          let name;
          do {
            name = sequence === 0 ? t('fileName') : t('numberedFileName', { number: sequence });
            sequence += 1;
          } while (takenNames.has(name));
          sequences.set(sessionId, sequence);
          try {
            window.localStorage.setItem(storageKey, String(sequence));
          } catch (failure) {
            console.warn('[dsh-pasted-text-file] Could not save filename sequence; using memory:', failure);
          }
          return name;
        }

        function Attachments(props) {
          const { attachments, canAcceptDrop, onAddFiles, onRemoveAttachment, uploads,
            onRetryFile, inputActions, renderFactorySlot, t, sessionId } = props;
          const phase = props.useInput((input) => input?.phase);
          const subagent = props.useSession((session) => session?.subagent);
          const root = React.useRef(null);
          const latest = React.useRef(props);
          latest.current = props;
          const [pending, setPending] = React.useState([]);
          const [error, setError] = React.useState('');
          const [dragging, setDragging] = React.useState(false);
          const editable = canAcceptDrop && inputActions !== undefined
            && phase !== 'adjudicating' && phase !== 'submitting';

          React.useEffect(() => {
            setPending([]);
            setError('');
          }, [sessionId]);

          React.useEffect(() => {
            const accepted = new Set(attachments.map((attachment) => attachment.file));
            setPending((previous) => {
              const remaining = previous.filter((item) => !accepted.has(item.file));
              return remaining.length === previous.length ? previous : remaining;
            });
          }, [attachments]);

          React.useEffect(() => {
            const composer = root.current?.closest('[data-slot="conversation.composer.bar"]');
            if (composer === null || composer === undefined) return;
            const onPaste = (event) => {
              const current = latest.current;
              const target = event.target instanceof Element ? event.target : null;
              if (event.defaultPrevented || !current.canAcceptDrop || !current.inputActions
                || !target?.closest('[contenteditable="true"][role="textbox"]')) return;
              // Child agents accept images only. Their original plain-text paste stays available.
              if (subagent != null) return;
              const clipboard = event.clipboardData;
              if (clipboard === null) return;
              const text = clipboard.getData('text/plain');
              if (!isLongText(text) || current.sessionId === undefined) return;
              const batch = fileBatch(clipboard);
              const takenNames = new Set([
                ...current.attachments.map((attachment) => attachment.file.name),
                ...batch.files.map((file) => file.name),
              ]);
              const name = nextFileName(current.sessionId, current.t, takenNames);
              const file = new File([text], name, { type: 'text/plain;charset=utf-8' });
              const record = { file, text, key: crypto.randomUUID() };
              pasted.set(file, record);
              setPending((previous) => [...previous, record]);
              setError('');
              event.preventDefault();
              event.stopPropagation();
              try {
                current.onAddFiles([...batch.files, file], batch.directories);
              } catch (failure) {
                console.error('[dsh-pasted-text-file] Could not add pasted text:', failure);
                setError(current.t('notAttached'));
              }
            };
            // Capture before Lexical's native paste handler. No editor internals are accessed.
            composer.addEventListener('paste', onPaste, true);
            return () => composer.removeEventListener('paste', onPaste, true);
          }, [sessionId, subagent]);

          React.useEffect(() => {
            let depth = 0;
            const reset = () => { depth = 0; setDragging(false); };
            const isFiles = (event) => event.dataTransfer?.types.includes('Files');
            const enter = (event) => {
              if (!isFiles(event)) return;
              event.preventDefault();
              depth += 1;
              setDragging(true);
            };
            const over = (event) => {
              if (!isFiles(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = latest.current.canAcceptDrop ? 'copy' : 'none';
            };
            const leave = (event) => {
              if (!isFiles(event)) return;
              depth = Math.max(0, depth - 1);
              if (depth === 0 || event.relatedTarget === null) reset();
            };
            const drop = (event) => {
              if (!isFiles(event)) return;
              event.preventDefault();
              reset();
              if (!latest.current.canAcceptDrop) return;
              const batch = fileBatch(event.dataTransfer);
              latest.current.onAddFiles(batch.files, batch.directories);
            };
            document.addEventListener('dragenter', enter);
            document.addEventListener('dragover', over);
            document.addEventListener('dragleave', leave);
            document.addEventListener('drop', drop);
            window.addEventListener('dragend', reset);
            return () => {
              document.removeEventListener('dragenter', enter);
              document.removeEventListener('dragover', over);
              document.removeEventListener('dragleave', leave);
              document.removeEventListener('drop', drop);
              window.removeEventListener('dragend', reset);
            };
          }, []);

          function restore(record, attachment) {
            if (!editable) return;
            try {
              if (!inputActions.insertText(record.text, inputActions.captureInsertion())) {
                setError(t('restoreFailed'));
                return;
              }
              if (attachment !== undefined) onRemoveAttachment(attachment.id);
              setPending((previous) => previous.filter((item) => item !== record));
              setError('');
              root.current?.closest('[data-slot="conversation.composer.bar"]')
                ?.querySelector('[contenteditable="true"][role="textbox"]')?.focus();
            } catch (failure) {
              console.error('[dsh-pasted-text-file] Could not restore pasted text:', failure);
              setError(t('restoreFailed'));
            }
          }

          function removeButton(attachment) {
            return h('button', {
              type: 'button', className: `${PREFIX}-remove`, disabled: !editable,
              'aria-label': t('remove', { name: attachment.file.name }),
              onClick: () => onRemoveAttachment(attachment.id),
            }, '×');
          }

          function fileCard(file, key, attachment, record) {
            const upload = attachment === undefined ? undefined : uploads[attachment.id];
            const status = attachment === undefined ? t('notAttached')
              : upload?.status === 'ready' ? t('ready')
              : upload?.status === 'error' ? upload.message || t('uploadFailed')
              : t('uploading');
            return h('div', { key, className: `${PREFIX}-file`, 'data-pasted-text': record ? 'true' : undefined },
              h('span', { className: `${PREFIX}-badge`, 'aria-hidden': true },
                file.name.split('.').pop().slice(0, 5).toUpperCase()),
              h('div', { className: `${PREFIX}-body` },
                h('div', { className: `${PREFIX}-name`, title: file.name }, file.name),
                h('div', { className: upload?.status === 'error' || attachment === undefined
                  ? `${PREFIX}-error` : `${PREFIX}-status`, title: status }, `${sizeText(file.size)} · ${status}`),
                record ? h('button', {
                  type: 'button', className: `${PREFIX}-link`, disabled: !editable,
                  onMouseDown: (event) => event.preventDefault(),
                  onClick: () => restore(record, attachment),
                }, t('restore')) : null,
                upload?.status === 'error' ? h('button', {
                  type: 'button', className: `${PREFIX}-link`, disabled: !editable,
                  onClick: () => onRetryFile(attachment.id),
                }, t('retry')) : null),
              attachment === undefined ? null : removeButton(attachment));
          }

          const accepted = new Set(attachments.map((attachment) => attachment.file));
          return h(React.Fragment, null,
            h('style', { 'data-plugin': 'dsh-pasted-text-file' }, CSS),
            h('div', { ref: root, className: `${PREFIX}-rail`, 'aria-label': t('attachments') },
              ...attachments.map((attachment) => attachment.kind === 'file'
                ? fileCard(attachment.file, attachment.id, attachment, pasted.get(attachment.file))
                : h('div', { key: attachment.id, className: `${PREFIX}-image` },
                  renderFactorySlot('conversation.images.content', {
                    images: [{ preview: { url: attachment.previewUrl, name: attachment.file.name } }],
                    loadImage: noImageRead, align: 'start', compact: true,
                  }), removeButton(attachment))),
              ...pending.filter((item) => !accepted.has(item.file))
                .map((item) => fileCard(item.file, item.key, undefined, item))),
            error ? h('div', { role: 'alert', className: `${PREFIX}-error` }, error) : null,
            dragging ? h('div', { className: `${PREFIX}-drop` }, t(canAcceptDrop ? 'drop' : 'dropBlocked')) : null);
        }

        ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT, priority: -100, locale: NS,
        }, Attachments));
      },
    };
  },
});
