// ---------------------------------------------------------------------------
// Table column aggregations (Calculate footer)
//
// Given a column and a list of tasks, produce a small summary shown at the
// bottom of that column — Focalboard/Notion-style. The set of meaningful
// summary types depends on what the column holds: text-ish columns support
// count/uniqueness metrics, numeric columns also support sum/avg/min/max,
// date columns add min/max, and so on.
//
// The heavy lifting happens client-side. The task list is already in memory
// (≤ 100 rows per fetched page in practice), so pushing this down to SQL
// would cost a round-trip per view change with no real speed win.
// ---------------------------------------------------------------------------

import type { TaskDto, BoardColumn } from '../types/api';
import type { CustomField, TaskFieldValue } from '../api/customFields';

export type AggType =
  | 'none'
  | 'count'
  | 'count_empty'
  | 'count_not_empty'
  | 'percent_empty'
  | 'percent_not_empty'
  | 'count_unique'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max';

/**
 * A column we can aggregate. Includes the handful of built-in table columns
 * (title, due_date, assignees, status column, …) and any board custom field.
 * `kind` decides which aggregation menu the user sees.
 */
export interface AggColumn {
  id: string;
  /** Human-readable column label, used only for sorting/deduping — not display. */
  label?: string;
  kind:
    | 'title'
    | 'date'
    | 'assignees'
    | 'status'
    | 'info'
    | 'custom_text'
    | 'custom_number'
    | 'custom_date'
    | 'custom_select'
    | 'custom_multi_select'
    | 'custom_checkbox'
    | 'custom_person';
  /** For custom fields only. */
  field?: CustomField;
}

export interface AggContext {
  columns: BoardColumn[];
  fieldValues: TaskFieldValue[];
}

export interface AggregateResult {
  value: string;
  /** True when the result is semantically "empty" — lets the UI de-emphasize. */
  empty: boolean;
}

// ---------------------------------------------------------------------------
// Public: which AggTypes make sense for a given column
// ---------------------------------------------------------------------------

const BASE_TYPES: AggType[] = [
  'count',
  'count_empty',
  'count_not_empty',
  'percent_empty',
  'percent_not_empty',
  'count_unique',
];

export function supportedAggTypes(col: AggColumn): AggType[] {
  switch (col.kind) {
    case 'custom_number':
      return [...BASE_TYPES, 'sum', 'avg', 'min', 'max'];
    case 'date':
    case 'custom_date':
      return [...BASE_TYPES, 'min', 'max'];
    case 'custom_checkbox':
      // Checkboxes collapse to true/false so count_unique is uninteresting.
      return ['count', 'count_empty', 'count_not_empty', 'percent_not_empty'];
    case 'info':
      return ['count'];
    case 'title':
    case 'status':
    case 'assignees':
    case 'custom_text':
    case 'custom_select':
    case 'custom_multi_select':
    case 'custom_person':
      return BASE_TYPES;
  }
}

export function aggTypeLabel(t: AggType): string {
  switch (t) {
    case 'none':
      return 'None';
    case 'count':
      return 'Count';
    case 'count_empty':
      return 'Count empty';
    case 'count_not_empty':
      return 'Count not empty';
    case 'percent_empty':
      return '% empty';
    case 'percent_not_empty':
      return '% not empty';
    case 'count_unique':
      return 'Count unique';
    case 'sum':
      return 'Sum';
    case 'avg':
      return 'Average';
    case 'min':
      return 'Min';
    case 'max':
      return 'Max';
  }
}

// ---------------------------------------------------------------------------
// Value extraction — map (task, column) → a primitive value or list
// ---------------------------------------------------------------------------

function valueFor(
  task: TaskDto,
  col: AggColumn,
  ctx: AggContext,
): unknown {
  switch (col.kind) {
    case 'title':
      return task.title;
    case 'date':
      // Built-in "due_date" column. (`start_date` isn't a visible column
      // in the current table header, but the same code would work.)
      return task.due_date;
    case 'status':
      // Column-kanban status — we return the column title as the "value"
      // so count_unique and count_empty do meaningful work.
      return (
        ctx.columns.find((c) => c.id === task.column_id)?.title ?? ''
      );
    case 'assignees':
      // Treated as a single multi-value — an empty assignee list is "empty".
      return task.assignees.length === 0 ? null : task.assignees.map((a) => a.id);
    case 'info':
      // Comment count / checklist progress — there's no natural aggregation
      // except total row count, which we derive generically in `compute`.
      return null;
    case 'custom_text':
    case 'custom_select':
    case 'custom_number':
    case 'custom_date':
    case 'custom_checkbox':
    case 'custom_multi_select':
    case 'custom_person': {
      const fv = ctx.fieldValues.find(
        (v) => v.task_id === task.id && v.field_id === col.field!.id,
      );
      return fv?.value ?? null;
    }
  }
}

/** A value is "empty" for aggregation purposes iff it is null/undefined, an
 *  empty string, or an empty array. */
function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function computeAggregate(
  tasks: TaskDto[],
  col: AggColumn,
  type: AggType,
  ctx: AggContext,
): AggregateResult {
  if (type === 'none') {
    return { value: '', empty: true };
  }

  const total = tasks.length;
  if (total === 0) {
    return { value: '—', empty: true };
  }

  const values = tasks.map((t) => valueFor(t, col, ctx));

  switch (type) {
    case 'count':
      return { value: String(total), empty: false };

    case 'count_empty': {
      const n = values.filter(isEmpty).length;
      return { value: String(n), empty: n === 0 };
    }

    case 'count_not_empty': {
      const n = values.filter((v) => !isEmpty(v)).length;
      return { value: String(n), empty: n === 0 };
    }

    case 'percent_empty': {
      const n = values.filter(isEmpty).length;
      const pct = Math.round((n / total) * 100);
      return { value: `${pct}%`, empty: n === 0 };
    }

    case 'percent_not_empty': {
      const n = values.filter((v) => !isEmpty(v)).length;
      const pct = Math.round((n / total) * 100);
      return { value: `${pct}%`, empty: n === 0 };
    }

    case 'count_unique': {
      // Flatten array values (multi_select, assignees) so "two tasks
      // both tagged [A, B]" counts 2 unique, not 1.
      const set = new Set<string>();
      for (const v of values) {
        if (isEmpty(v)) continue;
        if (Array.isArray(v)) {
          for (const inner of v) set.add(JSON.stringify(inner));
        } else {
          set.add(JSON.stringify(v));
        }
      }
      return { value: String(set.size), empty: set.size === 0 };
    }

    case 'sum': {
      const nums = values.map(asNumber).filter((n): n is number => n !== null);
      if (nums.length === 0) return { value: '0', empty: true };
      const sum = nums.reduce((a, b) => a + b, 0);
      return { value: formatNumber(sum), empty: false };
    }

    case 'avg': {
      const nums = values.map(asNumber).filter((n): n is number => n !== null);
      if (nums.length === 0) return { value: '—', empty: true };
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      return { value: formatNumber(avg), empty: false };
    }

    case 'min': {
      const result = extreme(values, col.kind, 'min');
      return result ?? { value: '—', empty: true };
    }

    case 'max': {
      const result = extreme(values, col.kind, 'max');
      return result ?? { value: '—', empty: true };
    }
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatNumber(n: number): string {
  // Drop trailing zeros on floats but keep ints tidy.
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

function extreme(
  values: unknown[],
  kind: AggColumn['kind'],
  dir: 'min' | 'max',
): AggregateResult | null {
  const picked = values.filter((v) => !isEmpty(v));
  if (picked.length === 0) return null;

  if (kind === 'custom_number') {
    const nums = picked
      .map(asNumber)
      .filter((n): n is number => n !== null);
    if (nums.length === 0) return null;
    const v = dir === 'min' ? Math.min(...nums) : Math.max(...nums);
    return { value: formatNumber(v), empty: false };
  }

  // Dates — compare as ISO strings which sort naturally.
  const strs = picked.map((v) => (typeof v === 'string' ? v : String(v)));
  strs.sort();
  const raw = dir === 'min' ? strs[0]! : strs[strs.length - 1]!;
  // For dates, drop the time portion in the summary to save space.
  const pretty = /^\d{4}-\d{2}-\d{2}T/.test(raw) ? raw.slice(0, 10) : raw;
  return { value: pretty, empty: false };
}

// ---------------------------------------------------------------------------
// Column builder — turns the (built-in-id | field) pair used by TableView
// into the AggColumn this library speaks.
// ---------------------------------------------------------------------------

export function buildAggColumn(
  id: string,
  field: CustomField | undefined,
): AggColumn {
  if (field) {
    switch (field.field_type) {
      case 'number':
        return { id, field, kind: 'custom_number' };
      case 'date':
        return { id, field, kind: 'custom_date' };
      case 'checkbox':
        return { id, field, kind: 'custom_checkbox' };
      case 'select':
        return { id, field, kind: 'custom_select' };
      case 'multi_select':
        return { id, field, kind: 'custom_multi_select' };
      case 'person':
        return { id, field, kind: 'custom_person' };
      default:
        return { id, field, kind: 'custom_text' };
    }
  }
  switch (id) {
    case 'title':
      return { id, kind: 'title' };
    case 'column':
      return { id, kind: 'status' };
    case 'due_date':
      return { id, kind: 'date' };
    case 'assignees':
      return { id, kind: 'assignees' };
    default:
      return { id, kind: 'info' };
  }
}
