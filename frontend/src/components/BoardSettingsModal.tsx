import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DraggableProvidedDragHandleProps,
} from '@hello-pangea/dnd';
import {
  useBoardCustomFields,
  useCreateCustomField,
  usePatchCustomField,
  useDeleteCustomField,
  type CustomField,
} from '../api/customFields';
import {
  useBoardMembers,
  useAddBoardMember,
  usePatchBoardMember,
  useRemoveBoardMember,
} from '../api/boards';
import { useUsers } from '../api/users';
import { useToastStore } from '../stores/toastStore';
import { tagClass, type TagVariant } from '../theme/constants';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Badge from './ui/Badge';
import { Spinner } from './Spinner';

/**
 * Per-board settings modal — currently exposes custom field CRUD only.
 *
 * Field types are split into two visibility tiers per the user's request:
 *
 *   • PRIMARY — `text` and `checkbox` (toggle). Always visible in the type
 *     picker. These cover the vast majority of property needs in casual
 *     boards (free-form notes, yes/no flags).
 *   • ADVANCED — `select`, `multi_select`, `date`, `number`, `url`. Behind
 *     an "Advanced types" disclosure to keep the new-user surface lean.
 *
 * `select` / `multi_select` get an inline option editor that uses the same
 * 8-family tag palette as Badge so option chips render with the same look
 * as priority/status chips elsewhere.
 *
 * Built-in fields seeded by migration 0010 — Status and Priority — are
 * deletable like any other field, but renaming them is allowed: the UI
 * doesn't treat them specially.
 */

const PRIMARY_TYPES = ['text', 'checkbox'] as const;
const ADVANCED_TYPES = ['select', 'multi_select', 'date', 'number', 'url', 'email', 'phone', 'person'] as const;
const TAG_VARIANTS: TagVariant[] = [
  'neutral',
  'info',
  'success',
  'warning',
  'orange',
  'danger',
  'critical',
  'accent',
];

interface FieldOption {
  label: string;
  color?: string;
}

interface BoardSettingsModalProps {
  boardId: string;
  onClose: () => void;
}

export default function BoardSettingsModal({ boardId, onClose }: BoardSettingsModalProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useBoardCustomFields(boardId);
  const createField = useCreateCustomField(boardId);
  const patchField = usePatchCustomField(boardId);
  const deleteField = useDeleteCustomField(boardId);
  const addToast = useToastStore((s) => s.addToast);

  // Members tab moved to its own modal (BoardMembersModal). This page now
  // focuses on field configuration only.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Inline "Add field" form state. When `pendingType` is set, the form
  // is open below the type buttons; user types a name, hits Enter or
  // "Add" to create. Replaces the previous `window.prompt()` flow,
  // which jarred users with a native browser dialog.
  const [pendingType, setPendingType] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState('');

  const fields = data?.items ?? [];

  /**
   * Persist a field reorder. We compute new positions as a clean integer
   * sequence (i * 1024) and patch every field whose position actually moved.
   * Using a coarse step keeps fractional inserts cheap if we ever add
   * client-only optimistic ordering; the absolute number is otherwise
   * meaningless beyond defining sort order.
   */
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;

    const next = [...fields];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);

    next.forEach((field, idx) => {
      const desiredPosition = idx * 1024;
      if (field.position !== desiredPosition) {
        patchField.mutate({ fieldId: field.id, position: desiredPosition });
      }
    });
  };

  const handleAddField = (fieldType: string) => {
    // Open the inline form for this type. Pre-fills nothing so the user
    // sees the placeholder. Submitted by pressing Enter or clicking Add.
    setPendingType(fieldType);
    setPendingName('');
  };

  const submitPendingField = () => {
    if (!pendingType || !pendingName.trim()) return;
    createField.mutate(
      {
        name: pendingName.trim(),
        field_type: pendingType,
        options:
          pendingType === 'select' || pendingType === 'multi_select'
            ? [{ label: 'Option 1', color: 'neutral' }]
            : undefined,
      },
      {
        onSuccess: () => {
          setPendingType(null);
          setPendingName('');
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : t('common.error');
          addToast('error', msg);
        },
      },
    );
  };

  const handleDelete = (field: CustomField) => {
    if (!window.confirm(t('boardSettings.deleteConfirm', { name: field.name }))) return;
    deleteField.mutate(field.id, {
      onError: () => addToast('error', t('common.error')),
    });
  };

  return (
    <Modal
      title={t('boardSettings.title')}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="space-y-5">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3
              className="text-sm font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              {t('boardSettings.fields')}
            </h3>
          </div>

          {/* Existing fields — drag the ⋮⋮ handle on a row to reorder. */}
          {isLoading ? (
            <Spinner />
          ) : fields.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('boardSettings.noFields')}
            </p>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="fields">
                {(provided) => (
                  <ul
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-2 mb-4"
                  >
                    {fields.map((field, index) => (
                      <Draggable key={field.id} draggableId={field.id} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <li
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              opacity: dragSnapshot.isDragging ? 0.85 : 1,
                            }}
                          >
                            <FieldRow
                              boardId={boardId}
                              field={field}
                              isEditing={editingId === field.id}
                              onStartEdit={() => setEditingId(field.id)}
                              onStopEdit={() => setEditingId(null)}
                              onDelete={() => handleDelete(field)}
                              dragHandleProps={dragProvided.dragHandleProps}
                            />
                          </li>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </ul>
                )}
              </Droppable>
            </DragDropContext>
          )}

          {/* Add field — primary types */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider"
               style={{ color: 'var(--color-text-muted)' }}>
              {t('boardSettings.addField')}
            </p>
            <div className="flex flex-wrap gap-2">
              {PRIMARY_TYPES.map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant="secondary"
                  onClick={() => handleAddField(type)}
                  disabled={createField.isPending}
                >
                  + {t(`boardSettings.type.${type}`)}
                </Button>
              ))}
            </div>

            {/* Advanced disclosure */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs hover:underline"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {showAdvanced
                ? `▼ ${t('boardSettings.advanced')}`
                : `▶ ${t('boardSettings.advanced')}`}
            </button>
            {showAdvanced && (
              <div className="flex flex-wrap gap-2 pl-2 border-l-2"
                   style={{ borderColor: 'var(--color-border)' }}>
                {ADVANCED_TYPES.map((type) => (
                  <Button
                    key={type}
                    size="sm"
                    variant="ghost"
                    onClick={() => handleAddField(type)}
                    disabled={createField.isPending}
                  >
                    + {t(`boardSettings.type.${type}`)}
                  </Button>
                ))}
              </div>
            )}
            {pendingType && (
              <div
                className="flex items-center gap-2 mt-2 p-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span
                  className="text-xs uppercase font-semibold"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {t(`boardSettings.type.${pendingType}`)}
                </span>
                <input
                  autoFocus
                  placeholder={t('boardSettings.fieldNamePrompt')}
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitPendingField();
                    if (e.key === 'Escape') {
                      setPendingType(null);
                      setPendingName('');
                    }
                  }}
                  className="flex-1 text-sm rounded px-2 py-1 outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <Button
                  size="sm"
                  onClick={submitPendingField}
                  disabled={!pendingName.trim() || createField.isPending}
                >
                  {t('common.create')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPendingType(null);
                    setPendingName('');
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Board Members Panel
// ---------------------------------------------------------------------------

const BOARD_ROLES = ['admin', 'editor', 'viewer'] as const;

/** Localized labels for the lowercase board roles (ROLES.md §3). */
const BOARD_ROLE_LABELS: Record<string, string> = {
  admin: '관리자',
  editor: '편집가능',
  viewer: '뷰어',
};

export function MembersPanel({ boardId }: { boardId: string }) {
  const { data: membersData, isLoading } = useBoardMembers(boardId);
  const { data: usersData } = useUsers();
  const addMember = useAddBoardMember(boardId);
  const patchMember = usePatchBoardMember(boardId);
  const removeMember = useRemoveBoardMember(boardId);
  const addToast = useToastStore((s) => s.addToast);

  const [search, setSearch] = useState('');
  const [newRole, setNewRole] = useState<string>('editor');

  const members = membersData?.items ?? [];
  const memberIds = new Set(members.map((m) => m.user_id));

  const filtered = useMemo(() => {
    const all = usersData?.items ?? [];
    const q = search.toLowerCase();
    return all
      .filter((u) => !memberIds.has(u.id))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 6);
  }, [usersData, memberIds, search]);

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      {/* Existing members */}
      {members.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No members yet. Add users below.
        </p>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center gap-3 p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-surface-hover)' }}
            >
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {m.user_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{m.user_name}</div>
                <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{m.user_email}</div>
              </div>
              <select
                value={m.role_in_board}
                onChange={(e) =>
                  patchMember.mutate(
                    { userId: m.user_id, role_in_board: e.target.value },
                    { onError: () => addToast('error', 'Failed to update role') },
                  )
                }
                className="text-xs border rounded px-1.5 py-1"
                style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              >
                {BOARD_ROLES.map((r) => (
                  <option key={r} value={r}>{BOARD_ROLE_LABELS[r] ?? r}</option>
                ))}
              </select>
              <button
                onClick={() =>
                  removeMember.mutate(m.user_id, {
                    onError: () => addToast('error', 'Failed to remove member'),
                  })
                }
                className="p-1 rounded hover:bg-red-100 hover:text-red-600 flex-shrink-0"
                title="Remove member"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add member */}
      <div
        className="pt-4 border-t space-y-2"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          멤버 초대
        </h4>
        <div className="flex gap-2">
          <input
            placeholder="이름 또는 이메일 검색..."
            className="flex-1 text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="text-sm border rounded-lg px-2 py-2"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {BOARD_ROLES.map((r) => (
              <option key={r} value={r}>{BOARD_ROLE_LABELS[r] ?? r}</option>
            ))}
          </select>
        </div>
        {search && filtered.length > 0 && (
          <ul
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {filtered.map((u) => (
              <li key={u.id}>
                <button
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[var(--color-surface-hover)]"
                  style={{ color: 'var(--color-text)' }}
                  onClick={() =>
                    addMember.mutate(
                      { user_id: u.id, role_in_board: newRole },
                      {
                        onSuccess: () => setSearch(''),
                        onError: () => addToast('error', 'Failed to add member'),
                      },
                    )
                  }
                >
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 truncate">{u.name}</span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{u.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {search && filtered.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No users found matching "{search}"</p>
        )}
      </div>
    </div>
  );
}

/**
 * Inline row for a single custom field. Two modes:
 *
 *   • Read mode — name + type chip + edit/delete buttons.
 *   • Edit mode — rename input, plus an option editor for select-family
 *     types (label text + variant swatch + remove).
 */
function FieldRow({
  boardId,
  field,
  isEditing,
  onStartEdit,
  onStopEdit,
  onDelete,
  dragHandleProps,
}: {
  boardId: string;
  field: CustomField;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onDelete: () => void;
  dragHandleProps: DraggableProvidedDragHandleProps | null | undefined;
}) {
  const { t } = useTranslation();
  const patchField = usePatchCustomField(boardId);
  const addToast = useToastStore((s) => s.addToast);

  const [name, setName] = useState(field.name);
  const [options, setOptions] = useState<FieldOption[]>(
    Array.isArray(field.options) ? field.options : [],
  );

  const isSelect = field.field_type === 'select' || field.field_type === 'multi_select';

  const handleSave = () => {
    if (!name.trim()) return;
    patchField.mutate(
      {
        fieldId: field.id,
        name: name.trim() !== field.name ? name.trim() : undefined,
        options: isSelect ? options : undefined,
      },
      {
        onSuccess: () => onStopEdit(),
        onError: () => addToast('error', t('common.error')),
      },
    );
  };

  const handleAddOption = () => {
    setOptions([...options, { label: `Option ${options.length + 1}`, color: 'neutral' }]);
  };

  const handleRemoveOption = (idx: number) => {
    setOptions(options.filter((_, i) => i !== idx));
  };

  const handleOptionChange = (idx: number, patch: Partial<FieldOption>) => {
    setOptions(options.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  /**
   * Move an option one slot up or down. Using ↑↓ buttons rather than a
   * nested DragDropContext keeps the BoardSettingsModal's outer field-level
   * dnd context free of cross-component droppable plumbing — option lists
   * are short (typically 2–8 entries) so adjacent-swap is fine in practice.
   */
  const handleMoveOption = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[idx], next[target]] = [next[target], next[idx]];
    setOptions(next);
  };

  if (!isEditing) {
    return (
      <div
        className="flex items-center gap-3 p-3 rounded-lg"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Drag handle — react-dnd attaches mouse/touch listeners through
            the spread props. Visually a vertical 6-dot grip; the cursor
            switches to grab on hover. */}
        <span
          {...(dragHandleProps ?? {})}
          aria-label={t('boardSettings.reorder')}
          title={t('boardSettings.reorder')}
          className="cursor-grab active:cursor-grabbing select-none px-1"
          style={{ color: 'var(--color-text-muted)' }}
        >
          ⋮⋮
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate"
                  style={{ color: 'var(--color-text)' }}>
              {field.name}
            </span>
            <Badge variant="neutral">
              {t(`boardSettings.type.${field.field_type}`)}
            </Badge>
          </div>
          {isSelect && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(field.options ?? []).map((opt, i) => {
                const isHex = opt.color?.startsWith('#');
                if (isHex) {
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-1.5 py-0 rounded text-xs"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${opt.color} 20%, transparent)`,
                        color: 'var(--color-text)',
                      }}
                    >
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: opt.color }}
                      />
                      {opt.label}
                    </span>
                  );
                }
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center px-1.5 py-0 rounded text-xs ${tagClass((opt.color as TagVariant) ?? 'neutral')}`}
                  >
                    {opt.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        {/* "Show on card" toggle — user flips this inline, no edit-mode
            round trip needed. Patching through usePatchCustomField
            invalidates the fields query which in turn re-renders the
            kanban cards that key off show_on_card. */}
        <label
          className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
          style={{ color: 'var(--color-text-secondary)' }}
          title={t('boardSettings.showOnCardHint', 'Display this field on the kanban card')}
        >
          <input
            type="checkbox"
            checked={field.show_on_card}
            onChange={(e) =>
              patchField.mutate(
                { fieldId: field.id, show_on_card: e.target.checked },
                { onError: () => addToast('error', t('common.error')) },
              )
            }
          />
          <span>{t('boardSettings.showOnCard', 'Show on card')}</span>
        </label>
        <Button size="sm" variant="ghost" onClick={onStartEdit}>
          {t('common.rename')}
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          {t('common.delete')}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="space-y-3 p-3 rounded-lg"
      style={{
        backgroundColor: 'var(--color-surface-hover)',
        border: '1px solid var(--color-primary)',
      }}
    >
      <div className="flex items-center gap-2">
        <input
          autoFocus
          className="flex-1 text-sm rounded px-2 py-1 outline-none"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Badge variant="neutral">
          {t(`boardSettings.type.${field.field_type}`)}
        </Badge>
      </div>

      {isSelect && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold"
             style={{ color: 'var(--color-text-muted)' }}>
            {t('boardSettings.options')}
          </p>
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="flex flex-col gap-0">
                <button
                  type="button"
                  onClick={() => handleMoveOption(idx, -1)}
                  disabled={idx === 0}
                  aria-label={t('boardSettings.moveUp')}
                  title={t('boardSettings.moveUp')}
                  className="text-[10px] leading-none px-0.5 disabled:opacity-30"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveOption(idx, 1)}
                  disabled={idx === options.length - 1}
                  aria-label={t('boardSettings.moveDown')}
                  title={t('boardSettings.moveDown')}
                  className="text-[10px] leading-none px-0.5 disabled:opacity-30"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  ▼
                </button>
              </div>
              <input
                className="flex-1 text-xs rounded px-2 py-1 outline-none"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
                value={opt.label}
                onChange={(e) => handleOptionChange(idx, { label: e.target.value })}
              />
              <div className="flex gap-0.5 items-center">
                {TAG_VARIANTS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleOptionChange(idx, { color: v })}
                    aria-label={v}
                    title={v}
                    className={`w-5 h-5 rounded ${tagClass(v)}`}
                    style={{
                      outline: opt.color === v ? '2px solid var(--color-primary)' : 'none',
                      outlineOffset: '1px',
                    }}
                  />
                ))}
                {/* Custom hex color: native color input stores the raw
                    `#rrggbb` into `opt.color`. `renderCardFieldValue`
                    and `tagClass`-callers detect the '#' prefix and
                    branch to a swatch+label rendering instead of a
                    palette class. */}
                <label
                  className="w-5 h-5 rounded flex items-center justify-center cursor-pointer relative"
                  title={t('boardSettings.customColor', 'Custom hex')}
                  style={{
                    border: '1px dashed var(--color-border)',
                    outline: opt.color?.startsWith('#') ? '2px solid var(--color-primary)' : 'none',
                    outlineOffset: '1px',
                    backgroundColor: opt.color?.startsWith('#') ? opt.color : 'transparent',
                  }}
                >
                  {!opt.color?.startsWith('#') && (
                    <span
                      className="text-[9px]"
                      aria-hidden
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      #
                    </span>
                  )}
                  <input
                    type="color"
                    value={opt.color?.startsWith('#') ? opt.color : '#888888'}
                    onChange={(e) => handleOptionChange(idx, { color: e.target.value })}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    aria-label={t('boardSettings.customColor', 'Custom hex')}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveOption(idx)}
                className="text-xs px-1"
                style={{ color: 'var(--color-danger)' }}
                aria-label={t('common.delete')}
              >
                ✕
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={handleAddOption}>
            + {t('boardSettings.addOption')}
          </Button>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onStopEdit}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={patchField.isPending || !name.trim()}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
