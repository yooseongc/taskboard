import { useId } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export default function Modal({
  title,
  onClose,
  children,
  footer,
  width = 'max-w-md',
}: ModalProps) {
  const titleId = useId();
  useEscapeKey(onClose);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`w-full ${width} flex flex-col max-h-[90vh]`}
          style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <h2 id={titleId} className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              style={{ color: 'var(--color-text-muted)' }}
              className="hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] rounded"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>
          {footer && (
            <div
              className="flex justify-end gap-3 px-6 py-4"
              style={{
                borderTop: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface-hover)',
                borderRadius: '0 0 var(--radius-xl) var(--radius-xl)',
              }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
