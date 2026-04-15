// Round C — Saved Views selector bar.
//
// Sits above a view (Board / Table / Calendar) and lets the user:
//   * pick from previously saved views of the same type,
//   * save the current on-screen filter/sort/column state as a new
//     named view,
//   * mark a saved view as "shared" so every board member sees it,
//   * delete a saved view they own.
//
// The component is deliberately generic over the config shape. Each
// view hands us its current `currentConfig` via props and wires
// `onLoadConfig` so selecting a view can replay the saved state.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useBoardViews,
  useCreateBoardView,
  useDeleteBoardView,
  usePatchBoardView,
  type BoardView,
  type ViewType,
} from '../api/views';
import { useToastStore } from '../stores/toastStore';

interface SavedViewBarProps {
  boardId: string;
  viewType: ViewType;
  /**
   * Serialise-ready snapshot of the current on-screen UI state. This
   * is stored as-is when the user hits "Save" and fed back via
   * `onLoadConfig` when they pick a saved view.
   */
  currentConfig: Record<string, unknown>;
  onLoadConfig: (config: Record<string, unknown>) => void;
}

export default function SavedViewBar({
  boardId,
  viewType,
  currentConfig,
  onLoadConfig,
}: SavedViewBarProps) {
  const { t } = useTranslation();
  const { data } = useBoardViews(boardId);
  const createView = useCreateBoardView(boardId);
  const patchView = usePatchBoardView(boardId);
  const deleteView = useDeleteBoardView(boardId);
  const addToast = useToastStore((s) => s.addToast);

  const [selectedId, setSelectedId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newShared, setNewShared] = useState(false);

  const allViews = data?.items ?? [];
  const views = allViews.filter((v) => v.view_type === viewType);
  const selected = views.find((v) => v.id === selectedId) ?? null;

  const handleLoad = (view: BoardView | null) => {
    if (!view) {
      setSelectedId('');
      onLoadConfig({});
      return;
    }
    setSelectedId(view.id);
    onLoadConfig(view.config);
  };

  const handleSave = () => {
    const name = newName.trim();
    if (!name) return;
    createView.mutate(
      {
        name,
        view_type: viewType,
        config: currentConfig,
        shared: newShared,
      },
      {
        onSuccess: (created) => {
          setSelectedId(created.id);
          setSaving(false);
          setNewName('');
          setNewShared(false);
          addToast('success', t('views.saved', 'View saved'));
        },
        onError: () => addToast('error', t('common.saveFailed')),
      },
    );
  };

  const handleOverwrite = () => {
    if (!selected) return;
    patchView.mutate(
      { viewId: selected.id, config: currentConfig },
      {
        onSuccess: () => addToast('success', t('views.updated', 'View updated')),
        onError: () => addToast('error', t('common.saveFailed')),
      },
    );
  };

  const handleDelete = () => {
    if (!selected) return;
    if (!confirm(t('views.confirmDelete', 'Delete this view?'))) return;
    deleteView.mutate(selected.id, {
      onSuccess: () => {
        setSelectedId('');
        onLoadConfig({});
      },
      onError: () => addToast('error', t('common.saveFailed')),
    });
  };

  return (
    <div
      className="flex items-center gap-2 px-6 py-1.5 text-sm"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <span style={{ color: 'var(--color-text-muted)' }}>
        {t('views.label', 'View')}:
      </span>
      <select
        value={selectedId}
        onChange={(e) => {
          const id = e.target.value;
          handleLoad(views.find((v) => v.id === id) ?? null);
        }}
        className="rounded px-2 py-1"
        style={{
          backgroundColor: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        <option value="">{t('views.default', '— Default —')}</option>
        {views.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
            {v.shared ? ' 🔗' : ''}
          </option>
        ))}
      </select>

      {saving ? (
        <>
          <input
            autoFocus
            placeholder={t('views.namePlaceholder', 'View name')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="rounded px-2 py-1 text-sm"
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
          <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <input
              type="checkbox"
              checked={newShared}
              onChange={(e) => setNewShared(e.target.checked)}
            />
            {t('views.shared', 'Share with board')}
          </label>
          <button
            onClick={handleSave}
            disabled={!newName.trim()}
            className="rounded px-2 py-1 text-xs font-medium"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-text-inverse)',
              opacity: newName.trim() ? 1 : 0.5,
            }}
          >
            {t('common.save')}
          </button>
          <button
            onClick={() => {
              setSaving(false);
              setNewName('');
            }}
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {t('common.cancel')}
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setSaving(true)}
            className="rounded px-2 py-1 text-xs"
            style={{ color: 'var(--color-primary)' }}
          >
            + {t('views.saveAs', 'Save as view')}
          </button>
          {selected && (
            <>
              <button
                onClick={handleOverwrite}
                className="text-xs"
                style={{ color: 'var(--color-text-secondary)' }}
                title={t('views.overwrite', 'Overwrite with current state')}
              >
                {t('views.overwriteShort', 'Update')}
              </button>
              <button
                onClick={handleDelete}
                className="text-xs"
                style={{ color: 'var(--color-danger)' }}
              >
                {t('common.delete')}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
