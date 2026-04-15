import { useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import type { TaskDto } from '../types/api';
import { PRIORITY_EVENT_COLORS } from '../theme/constants';
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
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  priority: string;
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

export default function CalendarView({
  tasks,
  onTaskClick,
  dateField,
  customFieldValues,
}: CalendarViewProps) {
  const events = useMemo<CalendarEvent[]>(() => {
    return tasks
      .flatMap((t) => {
        const dates = resolveDate(t, dateField, customFieldValues);
        if (!dates) return [];
        return [{
          id: t.id,
          title: t.title,
          start: dates.start,
          end: dates.end,
          priority: t.priority,
        }];
      });
  }, [tasks, dateField, customFieldValues]);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    return {
      style: {
        backgroundColor: PRIORITY_EVENT_COLORS[event.priority] ?? '#3b82f6',
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
        style={{ height: '100%' }}
        popup
      />
    </div>
  );
}
