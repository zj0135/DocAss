import { Layers, FolderOpen } from 'lucide-react';

export function AboutTab({
  about,
  desktopSupported,
  openLogs,
  openLicenses,
  setError,
}: {
  about?: { version: string; runtime: string; licenses: string[] };
  desktopSupported: boolean;
  openLogs: () => Promise<void>;
  openLicenses: () => Promise<void>;
  setError: (err: string) => void;
}) {
  return (
    <section key="about" aria-label="关于" className="animate-float-in space-y-4 max-w-2xl text-sm">
      <div>
        <span className="text-[10.5px] font-semibold uppercase tracking-widest text-blue-600">
          About
        </span>
        <h3 className="text-[16px] font-bold text-slate-900 tracking-tight">关于</h3>
      </div>

      <div className="flex items-center space-x-3.5 p-4 rounded-2xl border border-slate-200/80 bg-slate-50/40">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-[0_8px_18px_-4px_rgba(37,99,235,0.4)]">
          <Layers className="w-6 h-6" />
        </div>
        <div>
          <h4 className="text-[16px] font-bold text-slate-900">DocAss 文档助手</h4>
          <p className="text-[12px] text-slate-500 font-mono mt-0.5">
            版本 {about?.version ?? '正在读取…'}
          </p>
        </div>
      </div>

      {about?.runtime && (
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-xs text-slate-600 break-words font-mono">
          {about.runtime}
        </div>
      )}

      <details className="text-xs text-slate-600 bg-slate-50/50 rounded-xl border border-slate-200/70 p-3.5">
        <summary className="cursor-pointer font-medium text-slate-700">开源许可证</summary>
        <ul className="mt-2.5 space-y-1 pl-4 list-disc">
          {about?.licenses.map(name => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </details>

      {desktopSupported && (
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => void openLogs().catch(e => setError(String(e)))}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs text-slate-700 font-medium transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>打开日志目录</span>
          </button>
          <button
            type="button"
            onClick={() => void openLicenses().catch(e => setError(String(e)))}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs text-slate-700 font-medium transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>打开许可证目录</span>
          </button>
        </div>
      )}
    </section>
  );
}
