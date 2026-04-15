import { useTranslation } from 'react-i18next';
import type { TaskDto } from '../types/api';

interface Props {
  task: TaskDto;
  className?: string;
}

/**
 * Compact meta badges shown on Kanban cards and Table rows — checklist
 * progress, comment count. Hidden when no meta exists.
 */
export default function TaskMetaBadges({ task, className = '' }: Props) {
  const { t } = useTranslation();
  const total = task.checklist_summary?.total ?? 0;
  const checked = task.checklist_summary?.checked ?? 0;
  const comments = task.comment_count ?? 0;
  if (total === 0 && comments === 0) return null;
  return (
    <div
      className={`flex gap-2 text-xs ${className}`}
      style={{ color: 'var(--color-text-muted)' }}
    >
      {total > 0 && (
        <span title={t('tableView.checklistProgress')}>
          ☑ {checked}/{total}
        </span>
      )}
      {comments > 0 && (
        <span title={t('task.comments')}>💬 {comments}</span>
      )}
    </div>
  );
}
