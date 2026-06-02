import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DeleteConfirmProps {
  visible: boolean;
  title?: string;
  message?: string;
  itemName?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function DeleteConfirmModal({
  visible,
  title = '确认删除',
  message,
  itemName,
  onConfirm,
  onCancel,
  loading = false,
}: DeleteConfirmProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => buttonRef.current?.focus(), 100);
    }
  }, [visible]);

  if (!visible) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
  };

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }} onKeyDown={handleKeyDown}>
        <h3 style={{ marginBottom: 12 }}>{title}</h3>
        {message && (
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
            {message}
          </p>
        )}
        {itemName && (
          <p style={{ marginBottom: 16, fontSize: 14 }}>
            确定删除 <strong style={{ color: '#ff4d4f' }}>「{itemName}」</strong> 吗？此操作不可恢复。
          </p>
        )}
        {!itemName && !message && (
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
            确定要删除吗？此操作不可撤销。
          </p>
        )}
        <div className="form-actions" style={{ justifyContent: 'center', marginTop: 24 }}>
          <button type="button" onClick={onCancel}>取消</button>
          <button
            ref={buttonRef}
            type="button"
            className="danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
