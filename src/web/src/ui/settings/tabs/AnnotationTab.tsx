import type { Settings } from '../../../contracts';
import { CustomColorSwatch } from '../../primitives/CustomControls';

export function AnnotationTab({
  draft,
  setDraft,
  loaded,
  busy,
}: {
  draft: Settings;
  setDraft: React.Dispatch<React.SetStateAction<Settings>>;
  loaded: boolean;
  busy: boolean;
}) {
  return (
    <section key="annot" className="animate-float-in space-y-5 max-w-2xl">
      <div>
        <span className="text-[10.5px] font-semibold uppercase tracking-widest text-blue-600">
          Annotations
        </span>
        <h3 className="text-[16px] font-bold text-slate-900 tracking-tight">标注设置</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
        <label className="block">
          <span className="block text-[12px] font-medium text-slate-600 mb-1">标注作者</span>
          <input
            disabled={!loaded || busy}
            aria-label="标注作者"
            className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all"
            value={draft.author}
            onChange={e => setDraft({ ...draft, author: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="block text-[12px] font-medium text-slate-600 mb-1">
            对话面板宽度 (px)
          </span>
          <input
            disabled={!loaded || busy}
            aria-label="对话面板宽度"
            type="number"
            min={340}
            max={640}
            className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all"
            value={draft.chatWidth}
            onChange={e => setDraft({ ...draft, chatWidth: Number(e.target.value) })}
          />
        </label>

        <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/40">
          <div>
            <span className="block text-[12.5px] font-medium text-slate-700">默认标注颜色</span>
            <span className="text-[11px] font-mono text-slate-400 uppercase">{draft.color}</span>
          </div>
          <CustomColorSwatch
            ariaLabel="默认标注颜色"
            value={draft.color}
            onChange={color => setDraft({ ...draft, color })}
            size="md"
          />
        </div>

        <label className="block p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12.5px] font-medium text-slate-700">默认不透明度</span>
            <span className="text-[11.5px] font-mono text-slate-500">
              {Math.round(draft.opacity * 100)}%
            </span>
          </div>
          <input
            aria-label="默认不透明度"
            type="number"
            min={0}
            max={1}
            step={0.05}
            className="w-full px-2.5 py-1 border border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-hidden focus:border-blue-500 text-[12.5px]"
            value={draft.opacity}
            onChange={e => setDraft({ ...draft, opacity: Number(e.target.value) })}
          />
        </label>
      </div>
    </section>
  );
}
