import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useBoardCustomFields,
  useCreateCustomField,
  usePatchCustomField,
  useDeleteCustomField,
  type CustomField,
} from '../api/customFields';
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
const ADVANCED_TYPES = ['select', 'multi_select', 'date', 'number', 'url'] as const;
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
  const deleteField = useDeleteCustomField(boardId);
  const addToast = useToastStore((s) => s.addToast);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fields = data?.items ?? [];

  const handleAddField = (fieldType: string) => {
    const name = window.prompt(t('boardSettings.fieldNamePrompt'));
    if (!name?.trim()) return;
    createField.mutate(
      {
        name: name.trim(),
        field_type: fieldType,
        // For select-style types, seed one starter option so the field is
        // immediately usable; otherwise leave options empty.
        options:
          fieldType === 'select' || fieldType === 'multi_select'
            ? [{ label: 'Option 1', color: 'neutral' }]
            : undefined,
      },
      {
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

          {/* Existing fields */}
          {isLoading ? (
            <Spinner />
          ) : fields.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('boardSettings.noFields')}
            </p>
          ) : (
            <ul className="space-y-2 mb-4">
              {fields.map((field) => (
                <li key={field.id}>
                  <FieldRow
                    boardId={boardId}
                    field={field}
                    isEditing={editingId === field.id}
                    onStartEdit={() => setEditingId(field.id)}
                    onStopEdit={() => setEditingId(null)}
                    onDelete={() => handleDelete(field)}
                  />
                </li>
              ))}
            </ul>
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
          </div>
        </section>
      </div>
    </Modal>
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
}: {
  boardId: string;
  field: CustomField;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onDelete: () => void;
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

  if (!isEditing) {
    return (
      <div
        className="flex items-center gap-3 p-3 rounded-lg"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
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
              {(field.options ?? []).map((opt, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center px-1.5 py-0 rounded text-xs ${tagClass((opt.color as TagVariant) ?? 'neutral')}`}
                >
                  {opt.label}
                </span>
              ))}
            </div>
          )}
        </div>
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
              <div className="flex gap-0.5">
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
