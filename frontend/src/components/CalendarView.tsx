import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Calendar,
  dateFnsLocalizer,
  type View,
  type ToolbarProps,
} from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import type { TaskDto, GroupByKey } from '../types/api';
import type { CustomField, TaskFieldValue } from '../api/customFields';
import { PRIORITY_EVENT_COLORS } from '../theme/constants';
import { paletteColor } from '../lib/groupBy';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// 8 palette keys defined in theme/constants — when a custom field option
// stores one of these as its `color`, we look up the matching --tag-* CSS
// variable instead of trying to paint the literal string. Anything else
// is treated as a raw hex so hand-picked swatches still work.
const TAG_VARIANT_KEYS = new Set([
  'neutral',
  'info',
  'success',
  'warning',
  'orange',
  'danger',
  'critical',
  'accent',
]);

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export interface CalendarDateField {
  /** 'start_date' | 'due_date' or a custom field UUID */
  id: string;
  label: string;
  kind: 'builtin' | 'custom';
}

interface CalendarViewProps {
  tasks: TaskDto[];
  onTaskClick: (taskId: string) => void;
  /** The date field to display as events. Defaults to due_date. */
  dateField?: CalendarDateField;
  /** Custom field values keyed by `task_id:field_id` for custom date fields */
  customFieldValues?: Map<string, string>;
  /** Optional grouping — drives event color palette. */
  groupBy?: GroupByKey;
  customFields?: CustomField[];
  allFieldValues?: TaskFieldValue[];
  /** Creates a task at a given date. Wired from an inline, per-cell input
   *  — hover a day to surface a "+" affordance, click to expand the
   *  input, Enter commits. Omitting this prop makes the calendar
   *  read-only (no hover "+" appears). */
  onCreateTask?: (date: Date, title: string) => void;
}

// ---------------------------------------------------------------------------
// Inline-entry context
//
// react-big-calendar caches `components` by reference — anything passed to
// it that captures parent state gets re-mounted on every keystroke, which
// kills input focus. We give each cell a *stable* wrapper component that
// reads its behavior from a context populated by CalendarView itself.
// ---------------------------------------------------------------------------

interface EntryContextValue {
  activeDate: Date | null;
  draft: string;
  setDraft: (s: string) => void;
  startEdit: (d: Date) => void;
  commit: () => void;
  cancel: () => void;
  /** When false, the "+" hover affordance is never rendered (parent didn't
   *  pass `onCreateTask`, so the calendar is read-only). */
  enabled: boolean;
}

const EntryContext = createContext<EntryContextValue | null>(null);

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

interface ChipDescriptor {
  key: string;
  label: string;
  /** One of the TAG_VARIANT_KEYS. When set we bind to `--tag-{variant}-*`
   *  CSS vars instead of painting the raw string (which never matched a
   *  valid CSS color — that's the "some tags have no color" bug). */
  variant?: string;
  /** Raw hex (`#rrggbb`). Bypasses the palette — operator-chosen swatches. */
  hex?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: string;
  /** Pre-rendered chips for fields whose `show_on_card=true` on this board.
   *  Rendered as a second line under the title inside the custom event body. */
  chips: ChipDescriptor[];
}

// Calendar event blocks draw onto the react-big-calendar grid, which paints
// its own backdrop — so event blocks use saturated solid fills with white
// text rather than the soft-chip pattern used by Badge. The *hex* palette
// is the single PRIORITY_EVENT_COLORS map shared with any other raster
// surface that can't read CSS custom properties.

/**
 * Turn one (field, value) pair into a small chip descriptor for the event
 * body. Returns null when the value is empty so the event line doesn't
 * get cluttered with placeholders. Colors come from the `select` option's
 * stored `color` where available; other types fall back to a neutral tint
 * since the event background itself is already colored.
 */
/**
 * Split an option's stored `color` into its presentation mode. Options
 * can carry either a palette-variant key ("success", "danger", …) — in
 * which case we want the themeable --tag-*-bg vars — or a raw hex string.
 * Anything else (undefined, empty, unknown) falls through to the
 * translucent-overlay default handled at render time.
 */
function classifyOptionColor(raw?: string): Pick<ChipDescriptor, 'variant' | 'hex'> {
  if (!raw) return {};
  if (raw.startsWith('#')) return { hex: raw };
  if (TAG_VARIANT_KEYS.has(raw)) return { variant: raw };
  return {};
}

function renderFieldChip(
  field: CustomField,
  value: unknown,
): ChipDescriptor | null {
  if (value === undefined || value === null || value === '') return null;
  if (field.field_type === 'checkbox') {
    return { key: field.id, label: value ? `✓ ${field.name}` : `✗ ${field.name}` };
  }
  if (field.field_type === 'select') {
    const str = String(value);
    const opt = field.options.find((o) => o.label === str);
    return { key: field.id, label: str, ...classifyOptionColor(opt?.color) };
  }
  if (field.field_type === 'multi_select' && Array.isArray(value)) {
    if (value.length === 0) return null;
    const first = String(value[0]);
    const opt = field.options.find((o) => o.label === first);
    return {
      key: field.id,
      label: value.length > 1 ? `${first} +${value.length - 1}` : first,
      ...classifyOptionColor(opt?.color),
    };
  }
  if (field.field_type === 'date') {
    const iso = String(value);
    const short = iso.length >= 10 ? iso.slice(5, 10) : iso;
    return { key: field.id, label: `${field.name}: ${short}` };
  }
  const asStr = String(value);
  const short = asStr.length > 18 ? `${asStr.slice(0, 17)}…` : asStr;
  return { key: field.id, label: `${field.name}: ${short}` };
}

function resolveDate(
  task: TaskDto,
  dateField: CalendarDateField | undefined,
  customFieldValues: Map<string, string> | undefined,
): { start: Date; end: Date } | null {
  if (!dateField || dateField.id === 'due_date') {
    if (!task.due_date && !task.start_date) return null;
    const start = task.start_date ? new Date(task.start_date) : new Date(task.due_date!);
    const end = task.due_date ? new Date(task.due_date) : start;
    return { start, end };
  }
  if (dateField.id === 'start_date') {
    if (!task.start_date) return null;
    const d = new Date(task.start_date);
    return { start: d, end: d };
  }
  // custom date field
  const raw = customFieldValues?.get(`${task.id}:${dateField.id}`);
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return { start: d, end: d };
}

const STATUS_EVENT_COLORS: Record<string, string> = {
  open: '#6b7280',
  in_progress: '#3b82f6',
  done: '#10b981',
  archived: '#9ca3af',
};

function eventColor(
  task: TaskDto,
  groupBy: GroupByKey,
  customFields: CustomField[],
  allFieldValues: TaskFieldValue[],
): string {
  switch (groupBy.type) {
    case 'status':
      return STATUS_EVENT_COLORS[task.status] ?? '#6b7280';
    case 'priority':
      return PRIORITY_EVENT_COLORS[task.priority] ?? '#3b82f6';
    case 'assignee': {
      const first = task.assignees?.[0];
      return first ? paletteColor(first.id) : '#9ca3af';
    }
    case 'label': {
      const first = task.labels?.[0];
      return first?.color ?? '#9ca3af';
    }
    case 'custom_field': {
      const field = customFields.find((f) => f.id === groupBy.fieldId);
      if (!field) return '#3b82f6';
      const v = allFieldValues.find(
        (fv) => fv.task_id === task.id && fv.field_id === groupBy.fieldId,
      )?.value;
      if (!v) return '#9ca3af';
      if (field.field_type === 'select') {
        const opt = field.options.find((o) => o.label === v);
        return opt?.color ?? paletteColor(String(v));
      }
      if (field.field_type === 'multi_select' && Array.isArray(v)) {
        const first = v[0];
        if (!first) return '#9ca3af';
        const opt = field.options.find((o) => o.label === first);
        return opt?.color ?? paletteColor(first as string);
      }
      if (field.field_type === 'person') {
        return paletteColor(String(v));
      }
      return '#3b82f6';
    }
    case 'column':
    case 'none':
    default:
      return PRIORITY_EVENT_COLORS[task.priority] ?? '#3b82f6';
  }
}

export default function CalendarView({
  tasks,
  onTaskClick,
  dateField,
  customFieldValues,
  groupBy = { type: 'none' },
  customFields = [],
  allFieldValues = [],
  onCreateTask,
}: CalendarViewProps) {
  // Inline-entry state. `activeDate` is the day whose cell currently shows
  // an input; null means nothing's being edited. A ref mirrors the latest
  // draft so the stable commit/cancel handlers (inside useMemo) don't have
  // to list `draft` as a dependency and re-identity on every keystroke.
  const [activeDate, setActiveDate] = useState<Date | null>(null);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  draftRef.current = draft;

  const cancelEntry = useCallback(() => {
    setActiveDate(null);
    setDraft('');
  }, []);

  const commitEntry = useCallback(() => {
    const title = draftRef.current.trim();
    const date = activeDate;
    if (!onCreateTask || !date || !title) {
      cancelEntry();
      return;
    }
    onCreateTask(date, title);
    cancelEntry();
  }, [onCreateTask, activeDate, cancelEntry]);

  const startEdit = useCallback((d: Date) => {
    setActiveDate(d);
    setDraft('');
  }, []);

  const entryCtx = useMemo<EntryContextValue>(
    () => ({
      activeDate,
      draft,
      setDraft,
      startEdit,
      commit: commitEntry,
      cancel: cancelEntry,
      enabled: !!onCreateTask,
    }),
    [activeDate, draft, startEdit, commitEntry, cancelEntry, onCreateTask],
  );
  // `show_on_card` is the shared flag that drives which custom fields
  // appear on Board cards. We reuse it here so the user manages one list
  // of visible fields across views — no separate calendar setting to tune.
  // Cap at 3 chips to keep event blocks legible in month view.
  const visibleFields = useMemo(
    () => customFields.filter((f) => f.show_on_card).slice(0, 3),
    [customFields],
  );

  // Index field values by task for O(1) lookup during event assembly.
  const valuesByTask = useMemo(() => {
    const m = new Map<string, Map<string, unknown>>();
    for (const fv of allFieldValues) {
      if (!m.has(fv.task_id)) m.set(fv.task_id, new Map());
      m.get(fv.task_id)!.set(fv.field_id, fv.value);
    }
    return m;
  }, [allFieldValues]);

  const events = useMemo<CalendarEvent[]>(() => {
    return tasks.flatMap((t) => {
      const dates = resolveDate(t, dateField, customFieldValues);
      if (!dates) return [];
      const taskValues = valuesByTask.get(t.id);
      const chips = visibleFields
        .map((f) => renderFieldChip(f, taskValues?.get(f.id)))
        .filter((c): c is { key: string; label: string; color?: string } => c !== null);
      return [
        {
          id: t.id,
          title: t.icon ? `${t.icon} ${t.title}` : t.title,
          start: dates.start,
          end: dates.end,
          color: eventColor(t, groupBy, customFields, allFieldValues),
          chips,
        },
      ];
    });
  }, [tasks, dateField, customFieldValues, groupBy, customFields, allFieldValues, visibleFields, valuesByTask]);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    // Fading-chip pattern — soft-tinted background + 3px color stripe on
    // the left, body text uses the surface's --color-text. Readability wins
    // over saturation: month cells stacked 4+ deep no longer read as a
    // blaring "traffic-cone" row, and the chip still telegraphs its priority
    // via the stripe + subtle tint. color-mix() is widely supported (all
    // evergreen browsers 2023+); graceful fallback would simply show the
    // raw event.color if the UA couldn't parse it.
    return {
      style: {
        backgroundColor: `color-mix(in srgb, ${event.color} 14%, var(--color-surface))`,
        borderLeft: `3px solid ${event.color}`,
        borderTop: '1px solid var(--color-border)',
        borderRight: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        borderRadius: '4px',
        color: 'var(--color-text)',
        fontSize: '12px',
        padding: '1px 6px',
      },
    };
  }, []);

  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      onTaskClick(event.id);
    },
    [onTaskClick],
  );

  const defaultView: View = 'month';

  return (
    <EntryContext.Provider value={entryCtx}>
      <div className="p-4 h-full" style={{ minHeight: 600 }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          defaultView={defaultView}
          views={['month', 'week']}
          eventPropGetter={eventStyleGetter}
          onSelectEvent={handleSelectEvent}
          components={{
            toolbar: CalendarToolbar,
            event: CalendarEventBody,
            dateCellWrapper: DateCellWrapper,
          }}
          style={{ height: '100%' }}
          popup
        />
      </div>
    </EntryContext.Provider>
  );
}

/**
 * Custom event body — renders title plus a second line of property chips
 * for fields marked `show_on_card`. The library clips overflow via its own
 * container, so truncating the chip label at source keeps the event
 * readable even when the month-view row is ~20 px tall.
 */
function chipStyle(c: ChipDescriptor): React.CSSProperties {
  if (c.hex) {
    // Operator-chosen hex: paint directly. The event pill is now a light
    // fading chip, so any strong hex tends to read fine with white text —
    // we pick white because arbitrary hex can be either light or dark and
    // white is the safer default against saturated user palettes.
    return { backgroundColor: c.hex, color: '#ffffff' };
  }
  if (c.variant) {
    // Palette variant: resolve via CSS custom properties so light/dark
    // modes + user accent overrides all take effect automatically.
    return {
      backgroundColor: `var(--tag-${c.variant}-bg)`,
      color: `var(--tag-${c.variant}-text)`,
    };
  }
  // Unknown/missing — soft surface chip that sits on top of the fading
  // event background without punching through. `-hover` gives us a bump
  // above the event's tinted backdrop so the chip's edge still reads.
  return {
    backgroundColor: 'var(--color-surface-hover)',
    color: 'var(--color-text-secondary)',
  };
}

/**
 * Wraps each month-view date cell. The component identity is stable
 * (module-level + no prop closure state) so react-big-calendar never
 * remounts cells — we depend on context for the reactive parts:
 * `activeDate` drives which cell shows the input, and `enabled` toggles
 * the hover "+" affordance entirely.
 *
 * The cell keeps the library's default backdrop ({children}) so
 * `.rbc-today`, `.rbc-off-range-bg`, etc. stay applied. The overlay
 * sits on top via `absolute inset-0` and `pointer-events-none` except
 * on the interactive elements.
 */
function DateCellWrapper({ value, children }: { value: Date; children: React.ReactNode }) {
  const ctx = useContext(EntryContext);
  if (!ctx || !ctx.enabled) return <>{children}</>;
  const isActive = ctx.activeDate ? sameDay(ctx.activeDate, value) : false;
  return (
    <div className="relative group h-full w-full">
      {children}
      {/* Hover "+" — pointer-events enabled only on the button so event
          blocks above remain clickable. Positioned bottom-right so it
          doesn't collide with react-big-calendar's date number (top-right)
          or "+ N more" link (bottom-center). */}
      {!isActive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            ctx.startEdit(value);
          }}
          aria-label="Add task on this date"
          className="absolute bottom-1 right-1 w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none z-10 flex items-center justify-center text-xs font-bold"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-text-inverse)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        >
          +
        </button>
      )}
      {isActive && (
        <div
          className="absolute inset-x-1 bottom-1 z-20"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            value={ctx.draft}
            onChange={(e) => ctx.setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                ctx.commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                ctx.cancel();
              }
            }}
            onBlur={ctx.cancel}
            placeholder="태스크 제목 (Enter 저장)"
            className="w-full text-xs rounded px-1.5 py-1 outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-primary)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
            }}
          />
        </div>
      )}
    </div>
  );
}

function CalendarEventBody({ event }: { event: CalendarEvent }) {
  return (
    <div className="leading-tight">
      <div className="truncate" style={{ fontSize: '12px' }}>
        {event.title}
      </div>
      {event.chips.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {event.chips.map((c) => (
            <span
              key={c.key}
              className="inline-block rounded px-1 truncate font-medium"
              style={{
                fontSize: '10px',
                maxWidth: '100%',
                ...chipStyle(c),
              }}
              title={c.label}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Custom toolbar that replaces react-big-calendar's default. The library
 * ships a flat gray `.rbc-btn-group` row that neither picks up our design
 * tokens nor reads well in dark mode. Rebuilding it with the same button
 * vocabulary used elsewhere (px-2.5 py-1 rounded text-xs surface tokens)
 * keeps the calendar visually consistent with TableView / Board toolbars.
 */
function CalendarToolbar({
  label,
  onNavigate,
  onView,
  view,
}: ToolbarProps<CalendarEvent, object>) {
  const navBtnClass =
    'px-2.5 py-1 rounded text-xs font-medium transition-colors hover:bg-[var(--color-surface-hover)]';
  const viewBtnClass =
    'px-2.5 py-1 rounded text-xs font-medium transition-colors';
  return (
    <div className="flex items-center gap-2 pb-3 flex-wrap">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onNavigate('TODAY')}
          className={navBtnClass}
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => onNavigate('PREV')}
          aria-label="Previous"
          className={navBtnClass}
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => onNavigate('NEXT')}
          aria-label="Next"
          className={navBtnClass}
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          →
        </button>
      </div>
      <span
        className="text-sm font-semibold ml-1"
        style={{ color: 'var(--color-text)' }}
      >
        {label}
      </span>
      <div className="ml-auto flex items-center gap-1">
        {(['month', 'week'] as const).map((v) => {
          const active = view === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onView(v)}
              className={viewBtnClass}
              style={{
                backgroundColor: active
                  ? 'var(--color-primary-light)'
                  : 'var(--color-surface)',
                border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                color: active ? 'var(--color-primary-text)' : 'var(--color-text)',
              }}
            >
              {v === 'month' ? 'Month' : 'Week'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
