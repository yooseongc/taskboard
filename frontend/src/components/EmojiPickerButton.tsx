// Emoji picker button — a compact trigger that opens emoji-mart in a popover.
// Used to set `task.icon`. We keep the emoji-mart import lazy because the
// library pulls ~100KB of data (the full emoji catalog); eagerly shipping it
// would bloat the main bundle for users who never open a task.
import { useEffect, useRef, useState, Suspense, lazy } from 'react';

const Picker = lazy(() => import('@emoji-mart/react'));

interface Props {
  value: string | null;
  /** Called with the chosen emoji, or `null` to clear. */
  onChange: (next: string | null) => void;
  /** Fallback shown when no emoji is set. Defaults to a subtle note icon. */
  placeholder?: string;
  title?: string;
  /** Size in px for the button. Default 28. */
  size?: number;
}

export default function EmojiPickerButton({
  value,
  onChange,
  placeholder = '📄',
  title,
  size = 28,
}: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<unknown | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Load the emoji data once on first open — shares the fetched blob across
  // all picker instances on the page.
  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    import('@emoji-mart/data').then((m) => {
      if (!cancelled) setData(m.default);
    });
    return () => {
      cancelled = true;
    };
  }, [open, data]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hasValue = !!value;
  const display = hasValue ? value! : placeholder;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-label={title ?? 'Pick an emoji'}
        className="inline-flex items-center justify-center rounded hover:bg-[var(--color-surface-hover)]"
        style={{
          width: size,
          height: size,
          fontSize: Math.floor(size * 0.7),
          lineHeight: 1,
          opacity: hasValue ? 1 : 0.55,
        }}
      >
        {display}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30">
          <Suspense
            fallback={
              <div
                className="rounded-lg p-4 text-sm"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}
              >
                Loading…
              </div>
            }
          >
            {data !== null && (
              <Picker
                data={data as Record<string, unknown>}
                theme="auto"
                previewPosition="none"
                skinTonePosition="none"
                // Callback signature is lifted from emoji-mart: `{ native }`
                // is the ready-to-insert Unicode string.
                onEmojiSelect={(e: { native: string }) => {
                  onChange(e.native);
                  setOpen(false);
                }}
              />
            )}
          </Suspense>
          {hasValue && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="mt-1 w-full text-xs rounded-md py-1 hover:bg-[var(--color-surface-hover)]"
              style={{
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              Clear emoji
            </button>
          )}
        </div>
      )}
    </div>
  );
}
