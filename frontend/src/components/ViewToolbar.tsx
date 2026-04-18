import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CustomField } from '../api/customFields';
import type { GroupByKey, ViewDensity } from '../types/api';
import { type FilterChip, FilterChipEditor, operatorsFor } from './TableView';
import Button from './ui/Button';

type FilterMode = 'and' | 'or';

/** All filter plumbing for a view — the toolbar renders both the "+ 필터"
 *  button and, when chips exist, a second row with the editable chips and
 *  (optional) AND/OR mode toggle. Extracting this into a single prop keeps
 *  Board/Table/Calendar toolbars visually identical.
 */
interface FilterControl {
  chips: FilterChip[];
  fields: CustomField[];
  mode?: FilterMode;
  onModeChange?: (m: FilterMode) => void;
  onChange: (chip: FilterChip) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  /** Called when the user clicks "+ 필터". Default: add a chip bound to the
   *  first available custom field. Override if the view wants a different
   *  seed (or to open a picker instead). */
  onAdd?: () => void;
}

interface Props {
  search?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;

  groupBy?: GroupByKey;
  onGroupByChange?: (g: GroupByKey) => void;
  /** Which GroupBy options to offer. Calendar hides `column`; Board keeps it. */
  groupByOptions?: Array<GroupByKey['type']>;
  customFields?: CustomField[];

  density?: ViewDensity;
  onDensityChange?: (d: ViewDensity) => void;

  /** Sort menu (TableView only). `null` key means "no sort". */
  sort?: {
    key: string | null;
    dir: 'asc' | 'desc';
    options: { id: string; label: string }[];
    onChange: (key: string, dir: 'asc' | 'desc') => void;
  };

  /** Filter plumbing. When passed, the toolbar renders a "+ 필터" button
   *  (with count badge when chips exist) and a chip row below the main bar. */
  filters?: FilterControl;

  /** Optional "Properties" button — opens the view's field visibility panel. */
  properties?: { onOpen: () => void; label?: string };

  /** Optional right-side primary action (e.g. "+ 새 작업" on Table). */
  newAction?: { onClick: () => void; label: string };

  /** Slot for view-specific controls before density (e.g. calendar Date picker). */
  leftExtras?: ReactNode;
  /** Slot for extra right-side content (SavedViewBar). */
  rightExtras?: ReactNode;

  /** When true, strips the default page-level wrapper. Table view opts in
   *  because it nests the toolbar inside a card container of its own. */
  bare?: boolean;
}

const DEFAULT_GROUP_OPTIONS: Array<GroupByKey['type']> = [
  'none',
  'column',
  'status',
  'priority',
  'assignee',
  'label',
  'custom_field',
];

export default function ViewToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  groupBy,
  onGroupByChange,
  groupByOptions = DEFAULT_GROUP_OPTIONS,
  customFields = [],
  density,
  onDensityChange,
  sort,
  filters,
  properties,
  newAction,
  leftExtras,
  rightExtras,
  bare = false,
}: Props) {
  const { t } = useTranslation();

  const showModeToggle =
    filters?.mode !== undefined &&
    filters?.onModeChange !== undefined &&
    filters.chips.length >= 2;

  const handleAddFilter = () => {
    if (!filters) return;
    if (filters.onAdd) {
      filters.onAdd();
      return;
    }
    const firstField = filters.fields[0];
    if (!firstField) return;
    filters.onChange({
      id: crypto.randomUUID(),
      fieldId: firstField.id,
      operator: operatorsFor(firstField.field_type)[0],
      value: '',
    });
  };

  const mainRow = (
    <div className="flex flex-wrap items-center gap-2 py-2">
      {onSearchChange !== undefined && (
        <input
          type="text"
          placeholder={searchPlaceholder ?? t('tableView.searchPlaceholder')}
          className="rounded-lg px-3 py-1.5 text-sm w-64 outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
          value={search ?? ''}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        />
      )}
      {onGroupByChange && groupBy && (
        <GroupByMenu
          value={groupBy}
          onChange={onGroupByChange}
          options={groupByOptions}
          customFields={customFields}
        />
      )}
      {sort && <SortMenu sort={sort} />}
      {filters && (
        <AddFilterButton
          count={filters.chips.length}
          onClick={handleAddFilter}
        />
      )}
      {properties && (
        <PropertiesButton
          label={properties.label ?? t('tableView.properties')}
          onClick={properties.onOpen}
        />
      )}
      {leftExtras}
      <div className="ml-auto flex items-center gap-2">
        {onDensityChange && density && (
          <DensityToggle value={density} onChange={onDensityChange} />
        )}
        {newAction && (
          <Button size="sm" onClick={newAction.onClick}>
            {newAction.label}
          </Button>
        )}
        {rightExtras}
      </div>
    </div>
  );

  const chipRow = filters && filters.chips.length > 0 && (
    <div className="flex flex-wrap items-center gap-2 pb-2">
      {showModeToggle && (
        <div
          className="inline-flex rounded text-xs overflow-hidden"
          style={{ border: '1px solid var(--color-border)' }}
        >
          {(['and', 'or'] as FilterMode[]).map((m) => {
            const active = filters.mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => filters.onModeChange?.(m)}
                className="px-2 py-0.5 font-medium uppercase"
                style={{
                  backgroundColor: active
                    ? 'var(--color-primary)'
                    : 'var(--color-surface)',
                  color: active
                    ? 'var(--color-text-inverse)'
                    : 'var(--color-text-secondary)',
                }}
              >
                {t(`tableView.mode.${m}`)}
              </button>
            );
          })}
        </div>
      )}
      {filters.chips.map((chip, idx) => (
        <span key={chip.id} className="inline-flex items-center gap-2">
          {idx > 0 && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {t(`tableView.mode.${filters.mode ?? 'and'}`)}
            </span>
          )}
          <FilterChipEditor
            chip={chip}
            fields={filters.fields}
            onChange={filters.onChange}
            onRemove={() => filters.onRemove(chip.id)}
          />
        </span>
      ))}
      <button
        type="button"
        onClick={filters.onClear}
        className="text-xs hover:underline"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {t('tableView.clearFilters', 'Clear filters')}
      </button>
    </div>
  );

  if (bare) {
    return (
      <>
        {mainRow}
        {chipRow}
      </>
    );
  }

  return (
    <div
      className="px-4 md:px-6"
      style={{
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      {mainRow}
      {chipRow}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared button vocabulary — all three views get the same visual rhythm.
// ---------------------------------------------------------------------------

function AddFilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useTranslation();
  const active = count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)]"
      style={{
        backgroundColor: active ? 'var(--color-primary-light)' : 'var(--color-surface)',
        border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
        color: active ? 'var(--color-primary-text)' : 'var(--color-text)',
      }}
    >
      <span>
        {active
          ? t('toolbar.filter', 'Filter')
          : `+ ${t('tableView.addFilter', 'Add filter')}`}
      </span>
      {active && (
        <span
          className="inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 min-w-[18px]"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-text-inverse)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function PropertiesButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)]"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text)',
      }}
    >
      {label}
    </button>
  );
}

function SortMenu({
  sort,
}: {
  sort: {
    key: string | null;
    dir: 'asc' | 'desc';
    options: { id: string; label: string }[];
    onChange: (key: string, dir: 'asc' | 'desc') => void;
  };
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const active = sort.options.find((o) => o.id === sort.key);
  const activeLabel = active ? active.label : t('toolbar.sortUnset', 'Unsorted');
  const arrow = sort.dir === 'asc' ? '↑' : '↓';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)]"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        <span className="text-[var(--color-text-muted)]">
          {t('toolbar.sort', 'Sort')}:
        </span>
        <span className="font-medium">
          {activeLabel} {active && arrow}
        </span>
        <span className="text-[var(--color-text-muted)]">▾</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-20 min-w-[200px] rounded-lg py-1 shadow-lg"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          {sort.options.map((opt) => {
            const isActive = opt.id === sort.key;
            return (
              <div key={opt.id} className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => {
                    const next: 'asc' | 'desc' =
                      isActive && sort.dir === 'asc' ? 'desc' : 'asc';
                    sort.onChange(opt.id, next);
                    setOpen(false);
                  }}
                  className="flex-1 text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)] flex items-center justify-between"
                  style={{
                    color: 'var(--color-text)',
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  <span>{opt.label}</span>
                  {isActive && (
                    <span style={{ color: 'var(--color-primary)' }}>
                      {arrow}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GroupByMenu({
  value,
  onChange,
  options,
  customFields,
}: {
  value: GroupByKey;
  onChange: (g: GroupByKey) => void;
  options: Array<GroupByKey['type']>;
  customFields: CustomField[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = groupByLabel(value, customFields, t);
  const groupableFields = customFields.filter((f) =>
    ['select', 'multi_select', 'person'].includes(f.field_type),
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)]"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        <span className="text-[var(--color-text-muted)]">
          {t('toolbar.groupBy')}:
        </span>
        <span className="font-medium">{label}</span>
        <span className="text-[var(--color-text-muted)]">▾</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-20 min-w-[180px] rounded-lg py-1 shadow-lg"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          {options.includes('none') && (
            <MenuRow
              active={value.type === 'none'}
              onClick={() => {
                onChange({ type: 'none' });
                setOpen(false);
              }}
            >
              {t('toolbar.groupByNone')}
            </MenuRow>
          )}
          {options.includes('column') && (
            <MenuRow
              active={value.type === 'column'}
              onClick={() => {
                onChange({ type: 'column' });
                setOpen(false);
              }}
            >
              {t('toolbar.groupByColumn')}
            </MenuRow>
          )}
          {options.includes('priority') && (
            <MenuRow
              active={value.type === 'priority'}
              onClick={() => {
                onChange({ type: 'priority' });
                setOpen(false);
              }}
            >
              {t('toolbar.groupByPriority')}
            </MenuRow>
          )}
          {options.includes('assignee') && (
            <MenuRow
              active={value.type === 'assignee'}
              onClick={() => {
                onChange({ type: 'assignee' });
                setOpen(false);
              }}
            >
              {t('toolbar.groupByAssignee')}
            </MenuRow>
          )}
          {options.includes('label') && (
            <MenuRow
              active={value.type === 'label'}
              onClick={() => {
                onChange({ type: 'label' });
                setOpen(false);
              }}
            >
              {t('toolbar.groupByLabel')}
            </MenuRow>
          )}
          {options.includes('custom_field') && groupableFields.length > 0 && (
            <>
              <div
                className="px-3 py-1 text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {t('toolbar.customFields')}
              </div>
              {groupableFields.map((f) => (
                <MenuRow
                  key={f.id}
                  active={
                    value.type === 'custom_field' && value.fieldId === f.id
                  }
                  onClick={() => {
                    onChange({ type: 'custom_field', fieldId: f.id });
                    setOpen(false);
                  }}
                >
                  {f.name}
                </MenuRow>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuRow({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface-hover)] flex items-center justify-between"
      style={{
        color: 'var(--color-text)',
        fontWeight: active ? 600 : 400,
      }}
    >
      <span>{children}</span>
      {active && <span style={{ color: 'var(--color-primary)' }}>✓</span>}
    </button>
  );
}

function DensityToggle({
  value,
  onChange,
}: {
  value: ViewDensity;
  onChange: (d: ViewDensity) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="inline-flex rounded-lg text-xs overflow-hidden"
      style={{ border: '1px solid var(--color-border)' }}
    >
      {(['compact', 'normal'] as ViewDensity[]).map((d) => {
        const active = value === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className="px-2.5 py-1 font-medium"
            title={t(`toolbar.density.${d}`)}
            style={{
              backgroundColor: active
                ? 'var(--color-primary)'
                : 'var(--color-surface)',
              color: active
                ? 'var(--color-text-inverse)'
                : 'var(--color-text-secondary)',
            }}
          >
            {d === 'compact' ? '▬' : '☰'}
          </button>
        );
      })}
    </div>
  );
}

function groupByLabel(
  g: GroupByKey,
  customFields: CustomField[],
  t: (k: string) => string,
): string {
  switch (g.type) {
    case 'none':
      return t('toolbar.groupByNone');
    case 'column':
      return t('toolbar.groupByColumn');
    case 'status':
      return t('toolbar.groupByColumn');
    case 'priority':
      return t('toolbar.groupByPriority');
    case 'assignee':
      return t('toolbar.groupByAssignee');
    case 'label':
      return t('toolbar.groupByLabel');
    case 'custom_field': {
      const f = customFields.find((cf) => cf.id === g.fieldId);
      return f?.name ?? t('toolbar.groupByNone');
    }
  }
}
