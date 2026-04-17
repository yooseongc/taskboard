import { useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar';
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
}

// Calendar event blocks draw onto the react-big-calendar grid, which paints
// its own backdrop — so event blocks use saturated solid fills with white
// text rather than the soft-chip pattern used by Badge. The *hex* palette
// is the single PRIORITY_EVENT_COLORS map shared with any other raster
// surface that can't read CSS custom properties.

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
  const events = useMemo<CalendarEvent[]>(() => {
    return tasks.flatMap((t) => {
      const dates = resolveDate(t, dateField, customFieldValues);
      if (!dates) return [];
      return [
        {
          id: t.id,
          title: t.icon ? `${t.icon} ${t.title}` : t.title,
          start: dates.start,
          end: dates.end,
          color: eventColor(t, groupBy, customFields, allFieldValues),
        },
      ];
    });
  }, [tasks, dateField, customFieldValues, groupBy, customFields, allFieldValues]);

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

  // Derive the event color per the active groupBy. `none`/`column` fall
  // back to the priority palette — the pre-Round-H behaviour. Other
  // groupings pick a stable per-key color so events from the same group
  // share a hue at a glance.
  // (hoisted to helper below so the useMemo deps stay explicit)

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
        style={{ height: '100%' }}
        popup
      />
    </div>
  );
}
