import { useStore } from 'zustand';
import { Loader2, Scan, X } from 'lucide-react';
import type { DocumentText } from './DocumentText';
import type { TextMode } from './text';
import { CustomSelect } from '../ui/primitives/CustomSelect';
import { ToastBanner } from '../ui/primitives/ToastBanner';

export function OcrPageStatus({ controller, page }: { controller: DocumentText; page: number }) {
  const value = useStore(controller.store, (s) => s.pages[page]);
  return value && (value.phase === 'queued' || value.phase === 'running') ? (
    <div
      className="animate-float-in absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16)] rounded-xl px-4 py-2 text-[12.5px] text-slate-700 flex items-center gap-2 pointer-events-none whitespace-nowrap"
      role="status"
    >
      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
      <span className="font-medium">{value.phase === 'running' ? '正在识别文字…' : '本页等待识别…'}</span>
    </div>
  ) : null;
}

export function OcrControls({
  controller,
  page,
  count,
  disabled,
  kind = 'pdf',
}: {
  controller: DocumentText;
  page: number;
  count: number;
  disabled: boolean;
  kind?: 'pdf' | 'image';
}) {
  const state = useStore(controller.store);
  const current = state.pages[page];
  const active = Object.values(state.pages).filter((p) => p.phase === 'queued' || p.phase === 'running').length;
  const completed = Object.values(state.pages).filter((p) => p.phase === 'ready' || p.phase === 'empty').length;
  const hasFailed = Object.values(state.pages).some((p) => p.phase === 'failed');

  const fail = (e: unknown) => {
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      controller.store.setState((s) => ({
        pages: {
          ...s.pages,
          [page]: {
            ...s.pages[page],
            mode: s.pages[page]?.mode ?? 'auto',
            phase: 'failed',
            error: e instanceof Error ? e.message : String(e),
          },
        },
      }));
    }
  };

  const shouldShow =
    kind === 'image' ||
    current?.source !== 'native' ||
    active > 0 ||
    state.all ||
    hasFailed ||
    current?.phase === 'cancelled' ||
    current?.phase === 'empty';

  if (!shouldShow) return null;

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-1.5 border-b border-[#e3e6ea] bg-[#f8fafc]/95 backdrop-blur-xs text-[12px] text-[#5f6672] flex-wrap shrink-0 relative z-10"
      aria-label="文字识别控制"
    >
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white border border-slate-200/90 text-[#1f2329] font-medium shadow-2xs">
        <Scan className="w-3.5 h-3.5 text-blue-600" />
        <span>
          文字来源：
          {current?.source === 'hybrid'
            ? '混合'
            : current?.source === 'ocr'
              ? 'OCR'
              : current?.source === 'native'
                ? '原生'
                : '待判定'}
        </span>
      </span>

      <div className="flex items-center gap-1.5">
        <span>本页模式</span>
        <CustomSelect
          ariaLabel="本页文字模式"
          size="xs"
          disabled={disabled}
          value={current?.mode ?? 'auto'}
          onChange={(v) => void controller.setMode(page, v as TextMode).catch(fail)}
          options={[
            { value: 'auto', label: '自动' },
            { value: 'native', label: '仅原生' },
            { value: 'ocr', label: '仅 OCR' },
            { value: 'hybrid', label: '原生与 OCR' },
          ]}
        />
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => void controller.recognize(page, 0, true).catch(fail)}
        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200/90 hover:bg-slate-100 text-[#1f2329] font-medium shadow-2xs transition-colors disabled:opacity-40"
      >
        重新识别本页
      </button>

      <button
        type="button"
        disabled={disabled || state.all}
        onClick={() => void controller.all(count).catch(fail)}
        className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-medium transition-colors disabled:opacity-40"
      >
        识别全文
      </button>

      <span data-testid="ocr-coverage" className="text-slate-500">
        文字就绪 {completed}/{count} 页 · 未就绪 {count - completed} 页
      </span>

      {(active > 0 || state.all) && (
        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span role="status">
            {state.all ? `全文识别 ${state.completed}/${state.total} 页` : '正在识别页面'}（当前推理不可立即中断）
          </span>
          <button
            type="button"
            onClick={() => controller.cancel()}
            className="inline-flex items-center gap-0.5 hover:bg-blue-200/70 rounded-full px-1.5 py-0.5 text-blue-800 font-medium"
          >
            <X className="w-3 h-3" />
            <span>取消识别等待</span>
          </button>
        </div>
      )}

      {current?.phase === 'cancelled' && (
        <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">已取消等待</span>
      )}
      {current?.phase === 'empty' && (
        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">空白页 · 已检查</span>
      )}
      {current?.dpi && (
        <span className="text-slate-400 font-mono text-[11.5px] ml-auto">
          {Math.round(current.dpi)} DPI · {current.cached ? '缓存命中' : current.device}
        </span>
      )}
      {current?.error && (
        <ToastBanner tone="error" role="alert" className="py-1 px-2.5 text-xs">
          {current.error}
        </ToastBanner>
      )}
      {Object.entries(state.pages)
        .filter(([p, v]) => Number(p) !== page && v.phase === 'failed')
        .map(([p, v]) => (
          <ToastBanner key={p} tone="error" role="alert" className="py-1 px-2.5 text-xs">
            第 {p} 页识别失败：{v.error}
          </ToastBanner>
        ))}
    </div>
  );
}
