import type {
  BoardColumn,
  GroupByKey,
  Label,
  TaskDto,
  UserRef,
} from '../types/api';
import type { CustomField, TaskFieldValue } from '../api/customFields';

/**
 * A rendered group of tasks. `key` is the grouping identity (column id,
 * priority enum, user id, etc.). `label` is the human-readable header.
 * `color` is optional display hint — used by Board/Calendar to tint
 * group headers and Calendar events.
 */
export interface TaskGroup {
  key: string;
  label: string;
  color?: string;
  tasks: TaskDto[];
  /** Whether this group represents the absence of a value. */
  empty?: boolean;
}

export interface GroupContext {
  columns: BoardColumn[];
  labels: Label[];
  users: UserRef[];
  fields: CustomField[];
  fieldValues: TaskFieldValue[];
}

const UNASSIGNED_KEY = '__none__';

const STATUS_ORDER = ['open', 'in_progress', 'done', 'archived'] as const;
const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'] as const;

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  archived: 'Archived',
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#6b7280',
  in_progress: '#3b82f6',
  done: '#10b981',
  archived: '#9ca3af',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
};

/** Stable palette for categorical groups (assignee/label/select). */
const PALETTE = [
  '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#ef4444', '#84cc16', '#f97316', '#3b82f6',
];

export function paletteColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/**
 * Partition tasks into groups given a GroupByKey. Multi-valued groupings
 * (assignee, label, multi_select) place the same task in multiple groups;
 * tasks with no value land in a single "Unassigned" group.
 */
export function groupTasks(
  tasks: TaskDto[],
  groupBy: GroupByKey,
  ctx: GroupContext,
): TaskGroup[] {
  switch (groupBy.type) {
    case 'none':
      return [{ key: 'all', label: 'All', tasks }];

    case 'column':
      return groupByColumn(tasks, ctx.columns);

    case 'status':
      return groupBySingleValue(
        tasks,
        (t) => t.status,
        STATUS_ORDER as unknown as string[],
        STATUS_LABELS,
        STATUS_COLORS,
      );

    case 'priority':
      return groupBySingleValue(
        tasks,
        (t) => t.priority,
        PRIORITY_ORDER as unknown as string[],
        PRIORITY_LABELS,
        PRIORITY_COLORS,
      );

    case 'assignee':
      return groupByMultiValue(
        tasks,
        (t) => t.assignees.map((u) => u.id),
        ctx.users.map((u) => ({ key: u.id, label: u.name })),
        'Unassigned',
      );

    case 'label':
      return groupByMultiValue(
        tasks,
        (t) => t.labels.map((l) => l.id),
        ctx.labels.map((l) => ({ key: l.id, label: l.name, color: l.color })),
        'No label',
      );

    case 'custom_field':
      return groupByCustomField(tasks, groupBy.fieldId, ctx);
  }
}

function groupByColumn(tasks: TaskDto[], columns: BoardColumn[]): TaskGroup[] {
  const byColumn = new Map<string, TaskDto[]>();
  for (const col of columns) byColumn.set(col.id, []);
  for (const t of tasks) {
    const list = byColumn.get(t.column_id);
    if (list) list.push(t);
  }
  return columns
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((col) => ({
      key: col.id,
      label: col.title,
      color: col.color ?? undefined,
      tasks: byColumn.get(col.id) ?? [],
    }));
}

function groupBySingleValue(
  tasks: TaskDto[],
  getValue: (t: TaskDto) => string,
  order: string[],
  labels: Record<string, string>,
  colors: Record<string, string>,
): TaskGroup[] {
  const buckets = new Map<string, TaskDto[]>();
  for (const k of order) buckets.set(k, []);
  for (const t of tasks) {
    const v = getValue(t);
    if (!buckets.has(v)) buckets.set(v, []);
    buckets.get(v)!.push(t);
  }
  return Array.from(buckets.entries()).map(([key, taskList]) => ({
    key,
    label: labels[key] ?? key,
    color: colors[key],
    tasks: taskList,
  }));
}

function groupByMultiValue(
  tasks: TaskDto[],
  getValues: (t: TaskDto) => string[],
  definitions: Array<{ key: string; label: string; color?: string }>,
  emptyLabel: string,
): TaskGroup[] {
  const buckets = new Map<string, TaskDto[]>();
  for (const d of definitions) buckets.set(d.key, []);
  buckets.set(UNASSIGNED_KEY, []);
  for (const t of tasks) {
    const values = getValues(t);
    if (values.length === 0) {
      buckets.get(UNASSIGNED_KEY)!.push(t);
    } else {
      for (const v of values) {
        if (!buckets.has(v)) buckets.set(v, []);
        buckets.get(v)!.push(t);
      }
    }
  }
  const groups: TaskGroup[] = definitions.map((d) => ({
    key: d.key,
    label: d.label,
    color: d.color ?? paletteColor(d.key),
    tasks: buckets.get(d.key) ?? [],
  }));
  groups.push({
    key: UNASSIGNED_KEY,
    label: emptyLabel,
    color: '#9ca3af',
    tasks: buckets.get(UNASSIGNED_KEY) ?? [],
    empty: true,
  });
  return groups;
}

function groupByCustomField(
  tasks: TaskDto[],
  fieldId: string,
  ctx: GroupContext,
): TaskGroup[] {
  const field = ctx.fields.find((f) => f.id === fieldId);
  if (!field) return [{ key: 'all', label: 'All', tasks }];

  const valueByTask = new Map<string, unknown>();
  for (const v of ctx.fieldValues) {
    if (v.field_id === fieldId) valueByTask.set(v.task_id, v.value);
  }

  if (field.field_type === 'multi_select') {
    const defs = field.options.map((o) => ({
      key: o.label,
      label: o.label,
      color: o.color,
    }));
    return groupByMultiValue(
      tasks,
      (t) => {
        const v = valueByTask.get(t.id);
        return Array.isArray(v) ? (v as string[]) : [];
      },
      defs,
      'No value',
    );
  }

  if (field.field_type === 'select') {
    const optLabels: Record<string, string> = {};
    const optColors: Record<string, string> = {};
    const order: string[] = [];
    for (const o of field.options) {
      optLabels[o.label] = o.label;
      if (o.color) optColors[o.label] = o.color;
      order.push(o.label);
    }
    order.push(UNASSIGNED_KEY);
    optLabels[UNASSIGNED_KEY] = 'No value';
    return groupBySingleValue(
      tasks,
      (t) => {
        const v = valueByTask.get(t.id);
        return typeof v === 'string' && v ? v : UNASSIGNED_KEY;
      },
      order,
      optLabels,
      optColors,
    );
  }

  if (field.field_type === 'person') {
    const defs = ctx.users.map((u) => ({ key: u.id, label: u.name }));
    return groupByMultiValue(
      tasks,
      (t) => {
        const v = valueByTask.get(t.id);
        return typeof v === 'string' && v ? [v] : [];
      },
      defs,
      'Unassigned',
    );
  }

  return [{ key: 'all', label: 'All', tasks }];
}

/**
 * Describe the mutation needed to move `task` from its current group to
 * `newGroupKey` under the given `groupBy`. Returns `null` when the move
 * is a no-op or unsupported. The Board page translates this descriptor
 * into concrete hook calls (useAddAssignee / useAddLabel / usePatchTask /
 * useSetTaskFieldValue).
 */
export type GroupMutation =
  | { kind: 'patch-task'; patch: { status?: string; priority?: string } }
  | { kind: 'add-assignee'; userId: string; previousUserId?: string }
  | { kind: 'add-label'; labelId: string; previousLabelId?: string }
  | {
      kind: 'set-field';
      fieldId: string;
      value: unknown;
    };

export function mutationForGroupChange(
  task: TaskDto,
  groupBy: GroupByKey,
  fromGroupKey: string,
  toGroupKey: string,
  ctx: GroupContext,
): GroupMutation | null {
  if (fromGroupKey === toGroupKey) return null;

  switch (groupBy.type) {
    case 'status':
      return { kind: 'patch-task', patch: { status: toGroupKey } };

    case 'priority':
      return { kind: 'patch-task', patch: { priority: toGroupKey } };

    case 'assignee':
      if (toGroupKey === UNASSIGNED_KEY) return null;
      return {
        kind: 'add-assignee',
        userId: toGroupKey,
        previousUserId:
          fromGroupKey === UNASSIGNED_KEY ? undefined : fromGroupKey,
      };

    case 'label':
      if (toGroupKey === UNASSIGNED_KEY) return null;
      return {
        kind: 'add-label',
        labelId: toGroupKey,
        previousLabelId:
          fromGroupKey === UNASSIGNED_KEY ? undefined : fromGroupKey,
      };

    case 'custom_field': {
      const field = ctx.fields.find((f) => f.id === groupBy.fieldId);
      if (!field) return null;
      if (field.field_type === 'select' || field.field_type === 'person') {
        return {
          kind: 'set-field',
          fieldId: groupBy.fieldId,
          value: toGroupKey === UNASSIGNED_KEY ? null : toGroupKey,
        };
      }
      if (field.field_type === 'multi_select') {
        const current = ctx.fieldValues.find(
          (v) => v.field_id === groupBy.fieldId && v.task_id === task.id,
        );
        const arr = Array.isArray(current?.value) ? [...(current!.value as string[])] : [];
        if (toGroupKey !== UNASSIGNED_KEY && !arr.includes(toGroupKey)) {
          arr.push(toGroupKey);
        }
        if (fromGroupKey !== UNASSIGNED_KEY) {
          const idx = arr.indexOf(fromGroupKey);
          if (idx >= 0) arr.splice(idx, 1);
        }
        return { kind: 'set-field', fieldId: groupBy.fieldId, value: arr };
      }
      return null;
    }

    case 'none':
    case 'column':
      // Column moves are handled by the existing useMoveTask mutation directly.
      return null;
  }
}

export const UNASSIGNED = UNASSIGNED_KEY;
