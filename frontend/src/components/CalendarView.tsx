import { useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import type { TaskDto } from '../types/api';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface CalendarViewProps {
  tasks: TaskDto[];
  onTaskClick: (taskId: string) => void;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  priority: string;
}

const priorityColors: Record<string, string> = {
  urgent: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#16a34a',
};

export default function CalendarView({
  tasks,
  onTaskClick,
}: CalendarViewProps) {
  const events = useMemo<CalendarEvent[]>(() => {
    return tasks
      .filter((t) => t.due_date || t.start_date)
      .map((t) => {
        const start = t.start_date
          ? new Date(t.start_date)
          : new Date(t.due_date!);
        const end = t.due_date ? new Date(t.due_date) : start;
        return {
          id: t.id,
          title: t.title,
          start,
          end,
          priority: t.priority,
        };
      });
  }, [tasks]);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    return {
      style: {
        backgroundColor: priorityColors[event.priority] ?? '#3b82f6',
        borderRadius: '4px',
        opacity: 0.9,
        color: 'white',
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
