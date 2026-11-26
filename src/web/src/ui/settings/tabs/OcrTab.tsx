import type { Settings } from '../../../contracts';
import { CustomSelect } from '../../primitives/CustomSelect';
import { ToastBanner } from '../../primitives/ToastBanner';

export function OcrTab({
  draft,
  setDraft,
  loaded,
  busy,
  ocrSupported,
  clearCache,
  cacheStatus,
  setCacheStatus,
  setError,
}: {
  draft: Settings;
  setDraft: React.Dispatch<React.SetStateAction<Settings>>;
  loaded: boolean;
  busy: boolean;
  ocrSupported: boolean;
  clearCache: () => Promise<{ removedBytes: number }>;
  cacheStatus: string;
  setCacheStatus: (status: string) => void;
  setError: (err: string) => void;
}) {
  return (
    <section key="ocr" className="animate-float-in space-y-5 max-w-2xl">
      <div>
        <span className="text-[10.5px] font-semibold uppercase tracking-widest text-blue-600">
          Local OCR
        </span>
        <h3 className="text-[16px] font-bold text-slate-900 tracking-tight">文字识别</h3>
      </div>

      <fieldset
        disabled={!loaded || busy || !ocrSupported}
        className="space-y-4 text-[13px] disabled:opacity-60"
      >
        <legend className="sr-only">本机文字识别</legend>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-slate-600">模型档位</span>
            <CustomSelect
              ariaLabel="OCR 模型档位"
              size="xs"
              value={draft.ocr?.modelTier ?? 'Small'}
              disabled={!loaded || busy || !ocrSupported}
              onChange={v =>
                setDraft({
                  ...draft,
                  ocr: {
                    modelTier: v as 'Tiny' | 'Small' | 'Medium',
                    backend: draft.ocr?.backend ?? 'Auto',
                    cacheMiB: draft.ocr?.cacheMiB ?? 512,
                  },
                })
              }
              options={[
                { value: 'Tiny', label: 'Tiny' },
                { value: 'Small', label: 'Small' },
                { value: 'Medium', label: 'Medium' },
              ]}
            />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { id: 'Tiny' as const, label: 'Tiny (轻量)', desc: '极速低内存' },
              { id: 'Small' as const, label: 'Small (推荐)', desc: '均衡精准' },
              { id: 'Medium' as const, label: 'Medium (高精)', desc: '复杂版面' },
            ].map(tier => {
              const active = (draft.ocr?.modelTier ?? 'Small') === tier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  disabled={!loaded || busy || !ocrSupported}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      ocr: {
                        modelTier: tier.id,
                        backend: draft.ocr?.backend ?? 'Auto',
                        cacheMiB: draft.ocr?.cacheMiB ?? 512,
                      },
                    })
                  }
                  className={`p-3 rounded-xl border text-left transition-all ${
                    active
                      ? 'border-blue-500 bg-blue-50/30 ring-1 ring-blue-500/30'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="text-[12.5px] font-semibold text-slate-800">{tier.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{tier.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="block text-[12px] font-medium text-slate-600 mb-1">计算设备</span>
            <CustomSelect
              ariaLabel="OCR 计算设备"
              className="w-full"
              disabled={!loaded || busy || !ocrSupported}
              value={draft.ocr?.backend ?? 'Auto'}
              onChange={v =>
                setDraft({
                  ...draft,
                  ocr: {
                    modelTier: draft.ocr?.modelTier ?? 'Small',
                    backend: v as 'Auto' | 'Cpu',
                    cacheMiB: draft.ocr?.cacheMiB ?? 512,
                  },
                })
              }
              options={[
                { value: 'Auto', label: '自动选择（失败后回退 CPU）' },
                { value: 'Cpu', label: '仅 CPU' },
              ]}
            />
          </div>

          <label className="block">
            <span className="block text-[12px] font-medium text-slate-600 mb-1">
              文档与 OCR 缓存上限（MiB）
            </span>
            <input
              type="number"
              aria-label="OCR 缓存上限"
              min={128}
              max={4096}
              className="w-full h-9 px-3 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-500"
              value={draft.ocr?.cacheMiB ?? 512}
              onChange={e =>
                setDraft({
                  ...draft,
                  ocr: {
                    modelTier: draft.ocr?.modelTier ?? 'Small',
                    backend: draft.ocr?.backend ?? 'Auto',
                    cacheMiB: Number(e.target.value),
                  },
                })
              }
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              setError('');
              setCacheStatus('');
              void clearCache()
                .then(r =>
                  setCacheStatus(
                    `已清理 ${Math.round(r.removedBytes / 1024 / 1024)} MiB 缓存；在用文档和结果保留`,
                  ),
                )
                .catch(e => setError(String(e)));
            }}
            className="px-3.5 py-1.5 text-[12.5px] border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 font-medium transition-colors"
          >
            清理未使用的文档与 OCR 缓存
          </button>
        </div>
        {cacheStatus && (
          <ToastBanner tone="success" role="status">
            {cacheStatus}
          </ToastBanner>
        )}
      </fieldset>
      {!ocrSupported && (
        <p className="text-xs text-slate-500">真实 OCR 需要桌面服务，浏览器模式不进行识别。</p>
      )}
    </section>
  );
}
