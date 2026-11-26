import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  tone = 'danger',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4 select-none"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        className="animate-surface-in w-[400px] max-w-full bg-white border border-slate-200/90 rounded-2xl shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22)] p-5 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-[#1f2329]">{title}</h3>
            <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">{message}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="关闭确认窗口"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-xl text-[13px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`px-4 py-1.5 rounded-xl text-[13px] font-medium text-white shadow-xs transition-colors ${
              tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
