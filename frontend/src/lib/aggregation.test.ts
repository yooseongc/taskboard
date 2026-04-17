// Unit tests for table column aggregation logic. These pin the contract
// between TableView's footer UI and the aggregation library — if a new
// AggType is added, the tests document the expected shape.
import { describe, it, expect } from 'vitest';
import {
  computeAggregate,
  supportedAggTypes,
  buildAggColumn,
  type AggContext,
} from './aggregation';
import type { TaskDto, BoardColumn } from '../types/api';
import type { CustomField } from '../api/customFields';

const blankTask = (partial: Partial<TaskDto> = {}): TaskDto => ({
  id: 't',
  board_id: 'b',
  column_id: 'c',
  position: 0,
  title: 'Task',
  summary: null,
  description: null,
  priority: 'medium',
  status: 'open',
  start_date: null,
  due_date: null,
  icon: null,
  labels: [],
  assignees: [],
  checklist_summary: { total: 0, checked: 0 },
  comment_count: 0,
  created_by: 'u',
  version: 0,
  created_at: '',
  updated_at: '',
  ...partial,
});

const emptyCtx: AggContext = { columns: [], fieldValues: [] };

describe('aggregation — built-in title column', () => {
  const col = buildAggColumn('title', undefined);

  it('supports count family and count_unique', () => {
    expect(supportedAggTypes(col)).toContain('count');
    expect(supportedAggTypes(col)).toContain('count_unique');
    expect(supportedAggTypes(col)).not.toContain('sum');
  });

  it('count equals total tasks', () => {
    const tasks = [blankTask({ title: 'A' }), blankTask({ title: 'B' })];
    expect(computeAggregate(tasks, col, 'count', emptyCtx).value).toBe('2');
  });

  it('count_unique de-duplicates identical titles', () => {
    const tasks = [
      blankTask({ id: '1', title: 'A' }),
      blankTask({ id: '2', title: 'A' }),
      blankTask({ id: '3', title: 'B' }),
    ];
    expect(computeAggregate(tasks, col, 'count_unique', emptyCtx).value).toBe('2');
  });

  it('empty task list renders em-dash and is flagged empty', () => {
    const r = computeAggregate([], col, 'count', emptyCtx);
    expect(r.empty).toBe(true);
    expect(r.value).toBe('—');
  });
});

describe('aggregation — built-in due_date column', () => {
  const col = buildAggColumn('due_date', undefined);

  it('supports min/max and count_empty', () => {
    const types = supportedAggTypes(col);
    expect(types).toContain('min');
    expect(types).toContain('max');
    expect(types).toContain('count_empty');
  });

  it('count_empty counts null due dates', () => {
    const tasks = [
      blankTask({ due_date: '2026-05-01T00:00:00Z' }),
      blankTask({ due_date: null }),
      blankTask({ due_date: null }),
    ];
    expect(computeAggregate(tasks, col, 'count_empty', emptyCtx).value).toBe('2');
  });

  it('percent_empty is rounded to 0-100', () => {
    const tasks = [
      blankTask({ due_date: null }),
      blankTask({ due_date: null }),
      blankTask({ due_date: '2026-05-01T00:00:00Z' }),
      blankTask({ due_date: '2026-06-01T00:00:00Z' }),
    ];
    expect(
      computeAggregate(tasks, col, 'percent_empty', emptyCtx).value,
    ).toBe('50%');
  });

  it('min returns earliest ISO date (date portion only)', () => {
    const tasks = [
      blankTask({ due_date: '2026-05-10T00:00:00Z' }),
      blankTask({ due_date: '2026-04-30T23:59:59Z' }),
    ];
    expect(computeAggregate(tasks, col, 'min', emptyCtx).value).toBe('2026-04-30');
  });
});

describe('aggregation — custom number field', () => {
  const field: CustomField = {
    id: 'f-num',
    board_id: 'b',
    name: 'Story Points',
    field_type: 'number',
    options: [],
    position: 0,
    required: false,
    show_on_card: false,
    created_at: '',
  };
  const col = buildAggColumn('f-num', field);

  it('offers sum/avg/min/max alongside base types', () => {
    const types = supportedAggTypes(col);
    expect(types).toEqual(
      expect.arrayContaining(['sum', 'avg', 'min', 'max', 'count']),
    );
  });

  it('sum/avg compute across numeric values, ignoring empties', () => {
    const ctx: AggContext = {
      columns: [],
      fieldValues: [
        { task_id: '1', field_id: 'f-num', value: 5, updated_at: '' },
        { task_id: '2', field_id: 'f-num', value: 3, updated_at: '' },
        { task_id: '3', field_id: 'f-num', value: null, updated_at: '' },
      ],
    };
    const tasks = ['1', '2', '3'].map((id) => blankTask({ id }));
    expect(computeAggregate(tasks, col, 'sum', ctx).value).toBe('8');
    expect(computeAggregate(tasks, col, 'avg', ctx).value).toBe('4');
  });

  it('min/max handle mixed string/number fieldvalues', () => {
    const ctx: AggContext = {
      columns: [],
      fieldValues: [
        { task_id: '1', field_id: 'f-num', value: '12', updated_at: '' },
        { task_id: '2', field_id: 'f-num', value: 7, updated_at: '' },
      ],
    };
    const tasks = ['1', '2'].map((id) => blankTask({ id }));
    expect(computeAggregate(tasks, col, 'min', ctx).value).toBe('7');
    expect(computeAggregate(tasks, col, 'max', ctx).value).toBe('12');
  });
});

describe('aggregation — custom checkbox field', () => {
  const field: CustomField = {
    id: 'f-check',
    board_id: 'b',
    name: 'Done',
    field_type: 'checkbox',
    options: [],
    position: 0,
    required: false,
    show_on_card: false,
    created_at: '',
  };
  const col = buildAggColumn('f-check', field);

  it('only exposes count-oriented aggregations (no sum/avg)', () => {
    const types = supportedAggTypes(col);
    expect(types).not.toContain('sum');
    expect(types).toContain('count');
    expect(types).toContain('percent_not_empty');
  });
});

describe('aggregation — none', () => {
  it('returns an empty string so the footer cell renders blank', () => {
    const col = buildAggColumn('title', undefined);
    expect(computeAggregate([blankTask()], col, 'none', emptyCtx)).toEqual({
      value: '',
      empty: true,
    });
  });
});
