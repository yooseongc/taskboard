import { useTranslation } from 'react-i18next';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { MembersPanel } from './BoardSettingsModal';

/**
 * Standalone members modal — was previously a tab inside BoardSettingsModal.
 * Decoupled per user request so member management is one click from the
 * board header instead of two.
 */
export default function BoardMembersModal({
  boardId,
  onClose,
}: {
  boardId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      title={t('board.members', '멤버')}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <Button onClick={onClose} variant="secondary">
          {t('common.close')}
        </Button>
      }
    >
      <MembersPanel boardId={boardId} />
    </Modal>
  );
}
