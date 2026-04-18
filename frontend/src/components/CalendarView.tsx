import { useMemo, useCallback } from 'react';
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
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: string;
  /** Pre-rendered chips for the fields whose `show_on_card=true` on this board.
   *  Rendered as a second line under the title inside the custom event body. */
  chips: Array<{ key: string; label: string; color?: string }>;
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
function renderFieldChip(
  field: CustomField,
  value: unknown,
): { key: string; label: string; color?: string } | null {
  if (value === undefined || value === null || value === '') return null;
  if (field.field_type === 'checkbox') {
    return { key: field.id, label: value ? `✓ ${field.name}` : `✗ ${field.name}` };
  }
  if (field.field_type === 'select') {
    const str = String(value);
    const opt = field.options.find((o) => o.label === str);
    return { key: field.id, label: str, color: opt?.color };
  }
  if (field.field_type === 'multi_select' && Array.isArray(value)) {
    if (value.length === 0) return null;
    const first = String(value[0]);
    const opt = field.options.find((o) => o.label === first);
    return {
      key: field.id,
      label: value.length > 1 ? `${first} +${value.length - 1}` : first,
      color: opt?.color,
    };
  }
  if (field.field_type === 'date') {
    // Keep it tight — MM-DD, not the full ISO string.
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
}: CalendarViewProps) {
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
    return {
      style: {
        backgroundColor: event.color,
        borderRadius: '4px',
        opacity: 0.9,
        color: '#ffffff',
        border: 'none',
        fontSize: '12px',
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
        components={{ toolbar: CalendarToolbar, event: CalendarEventBody }}
        style={{ height: '100%' }}
        popup
      />
    </div>
  );
}

/**
 * Custom event body — renders title plus a second line of property chips
 * for fields marked `show_on_card`. The library clips overflow via its own
 * container, so truncating the chip label at source keeps the event
 * readable even when the month-view row is ~20 px tall.
 */
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
              className="inline-block rounded px-1 truncate"
              style={{
                fontSize: '10px',
                maxWidth: '100%',
                // Stay on top of the saturated event background: chips use
                // a translucent white overlay so color still shows through.
                backgroundColor: c.color ?? 'rgba(255,255,255,0.22)',
                color: '#ffffff',
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
