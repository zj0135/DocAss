import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';

interface ToastBannerProps {
  tone?: 'info' | 'warning' | 'error' | 'success' | 'loading';
  role?: 'alert' | 'status';
  children: React.ReactNode;
  action?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export const ToastBanner: React.FC<ToastBannerProps> = ({
  tone = 'info',
  role = 'status',
  children,
  action,
  onClose,
  className = '',
}) => {
  const styles = {
    info: 'bg-white/95 border-blue-200/80 text-slate-700',
    loading: 'bg-white/95 border-blue-200/80 text-blue-900',
    warning: 'bg-amber-50/95 border-amber-200/90 text-amber-900',
    error: 'bg-red-50/95 border-red-200/90 text-red-800',
    success: 'bg-emerald-50/95 border-emerald-200/90 text-emerald-800',
  }[tone];

  const icon = {
    info: <Info className="w-4 h-4 text-blue-600 shrink-0" />,
    loading: <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />,
    success: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
  }[tone];

  return (
    <div
      role={role}
      className={`animate-float-in backdrop-blur-md border rounded-xl shadow-[0_10px_28px_-6px_rgba(15,23,42,0.14)] px-3.5 py-2 text-[12.5px] flex items-center gap-2.5 ${styles} ${className}`}
    >
      {icon}
      <div className="flex-1 min-w-0 leading-snug">{children}</div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭提示"
          className="p-1 rounded-lg hover:bg-black/5 opacity-70 hover:opacity-100 transition-opacity shrink-0"
        >
          <X className="w-3.5 h-3.5" />
          <span className="sr-only">关闭</span>
        </button>
      )}
    </div>
  );
};
