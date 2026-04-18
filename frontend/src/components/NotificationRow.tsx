import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NotificationKind, NotificationSummary } from '../api/notifications';

/**
 * Three-tier layout shared by the bell popover and the /notifications page:
 *   [kind icon]  [body: one-line action + context]  [time · ⋯ menu]
 *
 * `compact` trims padding/font-sizes so the popover stays dense while the
 * full-page list keeps breathing room. Overdue rows get a left stripe and
 * danger-colored icon background so the urgency reads at a glance — per
 * DX Target 2-B in doc/DESIGN_EXPLORATION.md.
 */
export default function NotificationRow({
  notification: n,
  onActivate,
  onToggleRead,
  compact = false,
}: {
  notification: NotificationSummary;
  /** Click on the row body — typically navigates + marks read. */
  onActivate: () => void;
  /** When provided, renders a ⋯ menu with a "mark read/unread" action.
   *  Omitted in the bell popover to keep the lightweight feel. */
  onToggleRead?: (n: NotificationSummary) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const unread = !n.read_at;
  const urgent = n.kind === 'deadline_overdue';
  const palette = KIND_PALETTE[n.kind];
  const line = renderLine(n, t);

  return (
    <div
      className="flex items-start gap-3 group relative"
      style={{
        padding: compact ? '0.5rem 0.75rem' : '0.75rem 1rem',
        backgroundColor: unread ? 'var(--color-surface)' : 'transparent',
        // Left urgency stripe for overdue rows — a 3px bar that's always
        // there on overdue, regardless of read/unread.
        borderLeft: urgent
          ? '3px solid var(--color-danger)'
          : '3px solid transparent',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* Leading kind icon — color-coded circle, reads as a type glyph from
          any distance. Icons are inline SVG so they inherit `currentColor`. */}
      <div
        className="flex-shrink-0 rounded-full flex items-center justify-center"
        style={{
          width: compact ? 28 : 32,
          height: compact ? 28 : 32,
          backgroundColor: palette.bg,
          color: palette.text,
        }}
        aria-hidden
      >
        {palette.icon}
      </div>

      {/* Body — click target. A separate button so the ⋯ menu doesn't
          bubble into onActivate. */}
      <button
        type="button"
        onClick={onActivate}
        className="flex-1 min-w-0 text-left hover:bg-[var(--color-surface-hover)] -m-0.5 p-0.5 rounded"
        style={{ background: 'transparent' }}
      >
        <div
          className="line-clamp-2"
          style={{
            color: urgent ? 'var(--color-danger)' : 'var(--color-text)',
            fontWeight: unread ? 600 : 400,
            fontSize: compact ? '0.8125rem' : '0.875rem',
          }}
        >
          {line}
        </div>
        <div
          className="mt-0.5 flex items-center gap-1.5 text-[11px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span>{relativeTime(n.created_at, t)}</span>
          {n.board_title && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{n.board_title}</span>
            </>
          )}
          {!compact && (
            <>
              <span aria-hidden>·</span>
              <KindBadge kind={n.kind} />
            </>
          )}
        </div>
      </button>

      {/* Trailing unread dot — subtle signal when the row is already above
          the fold and the stripe alone isn't enough. Omitted when an
          overdue stripe is already carrying urgency. */}
      {unread && !urgent && (
        <span
          aria-hidden
          className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: 'var(--color-primary)' }}
        />
      )}

      {onToggleRead && <RowMenu notification={n} onToggle={onToggleRead} />}
    </div>
  );
}

function RowMenu({
  notification: n,
  onToggle,
}: {
  notification: NotificationSummary;
  onToggle: (n: NotificationSummary) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="More"
        className="p-1 rounded hover:bg-[var(--color-surface-hover)] opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-lg py-1 shadow-lg"
          style={{
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onToggle(n);
            }}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)]"
            style={{ color: 'var(--color-text)' }}
          >
            {n.read_at ? t('notifications.markUnread') : t('notifications.markRead')}
          </button>
        </div>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: NotificationKind }) {
  const { t } = useTranslation();
  const palette = KIND_PALETTE[kind];
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: palette.bg,
        color: palette.text,
      }}
    >
      {t(`notifications.kind.${kind}`)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers — now driven by i18n instead of hard-coded Korean literals.
// ---------------------------------------------------------------------------

export function renderLine(
  n: NotificationSummary,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const who = n.actor_name ?? t('notifications.unknownActor');
  const task = n.task_title ?? t('notifications.unknownTask');
  return t(`notifications.line.${n.kind}`, { who, task });
}

export function notificationHref(n: NotificationSummary): string | null {
  if (n.board_id && n.task_id) {
    return `/boards/${n.board_id}?task=${n.task_id}`;
  }
  if (n.board_id) {
    return `/boards/${n.board_id}`;
  }
  return null;
}

export function relativeTime(
  iso: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return t('notifications.time.seconds', { n: Math.max(0, Math.floor(diff)) });
  if (diff < 3600) return t('notifications.time.minutes', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('notifications.time.hours', { n: Math.floor(diff / 3600) });
  if (diff < 86400 * 30) return t('notifications.time.days', { n: Math.floor(diff / 86400) });
  return d.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Kind palette — colored leading icon + matching badge. Each entry binds to
// --tag-*-bg / --tag-*-text so the swatches flip cleanly in dark mode.
// ---------------------------------------------------------------------------

type KindPaletteEntry = {
  bg: string;
  text: string;
  icon: React.ReactNode;
};

const clockIcon = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
  </svg>
);
const alertIcon = (
  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M12 2L1 21h22L12 2zm0 7v5m0 3v.01" stroke="currentColor" strokeWidth={2} strokeLinecap="round" fill="none" />
  </svg>
);
const personIcon = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <circle cx="12" cy="8" r="4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 21v-1a7 7 0 0114 0v1" />
  </svg>
);
const atIcon = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12v1.5a2.5 2.5 0 005 0V12a8 8 0 10-8 8" />
  </svg>
);
const pencilIcon = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const KIND_PALETTE: Record<NotificationKind, KindPaletteEntry> = {
  deadline_soon: {
    bg: 'var(--tag-warning-bg)',
    text: 'var(--tag-warning-text)',
    icon: clockIcon,
  },
  deadline_overdue: {
    bg: 'var(--tag-danger-bg)',
    text: 'var(--tag-danger-text)',
    icon: alertIcon,
  },
  assigned: {
    bg: 'var(--tag-accent-bg)',
    text: 'var(--tag-accent-text)',
    icon: personIcon,
  },
  mentioned: {
    bg: 'var(--tag-info-bg)',
    text: 'var(--tag-info-text)',
    icon: atIcon,
  },
  board_activity: {
    bg: 'var(--tag-neutral-bg)',
    text: 'var(--tag-neutral-text)',
    icon: pencilIcon,
  },
};
