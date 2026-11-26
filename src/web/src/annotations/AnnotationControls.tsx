import { useRef } from 'react';
import type { Annotation } from '../contracts';
import type { DocSession } from '../state/DocSession';
import type { Tool, ToolStyle } from './model';
import { textType } from './model';
import { StickyNoteCard } from '../ui/document/StickyNoteCard';
import { CustomSelect } from '../ui/primitives/CustomSelect';
import { CustomColorSwatch } from '../ui/primitives/CustomControls';
import { Trash2, Edit3, RotateCcw, MessageSquare, CheckCircle2 } from 'lucide-react';

const tools: [Tool, string][] = [
  ['select', '选择'],
  ['highlight', '高亮'],
  ['underline', '下划线'],
  ['note', '便签'],
  ['freetext', '文字批注'],
  ['ink', '手绘'],
  ['rect', '矩形'],
  ['arrow', '箭头'],
  ['eraser', '橡皮擦'],
];

export function AnnotationToolbar({
  tool,
  setTool,
  style,
  setStyle,
  disabled,
  undo,
  redo,
  undoCount,
  redoCount,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  style: ToolStyle;
  setStyle: (s: Partial<ToolStyle>) => void;
  disabled: boolean;
  undo: () => void;
  redo: () => void;
  undoCount: number;
  redoCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1 bg-white border-b text-xs" aria-label="标注工具栏">
      {tools.map(([id, label]) => (
        <button
          key={id}
          aria-label={label + '工具'}
          aria-pressed={id === tool}
          disabled={disabled && id !== 'select'}
          className={`px-2 py-1 rounded disabled:opacity-40 ${
            id === tool ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'
          }`}
          onClick={() => setTool(id)}
        >
          {label}
        </button>
      ))}
      <label className="ml-2">
        颜色
        <input
          aria-label="工具颜色"
          type="color"
          value={style.color}
          onChange={(e) => setStyle({ color: e.target.value })}
          className="w-7 h-5 ml-1 align-middle"
        />
      </label>
      <label className="ml-2">
        线宽
        <select
          aria-label="工具线宽"
          value={style.strokeWidth}
          onChange={(e) => setStyle({ strokeWidth: Number(e.target.value) })}
        >
          {[1, 2, 3, 5, 8].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <button className="ml-auto px-2 disabled:opacity-40" disabled={disabled || !undoCount} onClick={undo}>
        撤销
      </button>
      <button className="px-2 disabled:opacity-40" disabled={disabled || !redoCount} onClick={redo}>
        重做
      </button>
    </div>
  );
}

export function AnnotationInspector({
  annotation: a,
  session,
  onEdit,
  onReanchor,
  onShowSource,
  fail,
}: {
  annotation: Annotation;
  session: DocSession;
  onEdit: () => void;
  onReanchor: () => void;
  onShowSource?: () => void;
  fail: (e: unknown) => void;
}) {
  const update = (changes: Partial<Annotation>) => void session.put({ ...a, ...changes }).catch(fail);
  return (
    <div
      className="animate-surface-in absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-32px)] flex flex-wrap gap-2.5 items-center px-3.5 py-1.5 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-[0_12px_32px_-8px_rgba(15,23,42,0.16)] text-[12px] text-[#5f6672]"
      aria-label="标注属性"
    >
      <span className="font-semibold text-[#1f2329] flex items-center gap-1.5 pr-1">
        <span className="w-2.5 h-2.5 rounded-full inline-block ring-1 ring-black/10" style={{ backgroundColor: a.color }} />
        {tools.find(([id]) => id === a.type)?.[1]} · {a.author}
      </span>

      <div className="w-[1px] h-4 bg-slate-200" />

      <label className="flex items-center gap-1.5 cursor-pointer">
        <span>颜色</span>
        <CustomColorSwatch
          ariaLabel="标注颜色"
          value={a.color}
          onChange={(color) => update({ color })}
        />
      </label>

      <div className="flex items-center gap-1.5">
        <span>不透明度</span>
        <CustomSelect
          ariaLabel="标注不透明度"
          size="xs"
          value={String(a.opacity)}
          onChange={(v) => update({ opacity: Number(v) })}
          options={[0.2, 0.35, 0.5, 0.75, 1].map((v) => ({
            value: String(v),
            label: `${Math.round(v * 100)}%`,
          }))}
        />
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-100 text-[#1f2329] font-medium transition-colors"
      >
        <Edit3 className="w-3 h-3" />
        <span>编辑{a.type === 'freetext' ? '文字' : '评论'}</span>
      </button>

      {textType(a) && (
        <button
          type="button"
          onClick={onReanchor}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-100 text-[#1f2329] font-medium transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>重新选择文字</span>
        </button>
      )}

      {!textType(a) && a.migrationState === 'needsReview' && a.page <= session.store.getState().pageCount && (
        <button
          type="button"
          onClick={() => update({ migrationState: 'confirmed' })}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors"
        >
          <CheckCircle2 className="w-3 h-3" />
          <span>确认当前位置</span>
        </button>
      )}

      {onShowSource && (
        <button
          type="button"
          onClick={onShowSource}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition-colors"
        >
          <MessageSquare className="w-3 h-3" />
          <span>查看来源消息</span>
        </button>
      )}

      <button
        type="button"
        className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-red-50 text-red-600 font-medium transition-colors"
        onClick={() => void session.remove(a.id).catch(fail)}
      >
        <Trash2 className="w-3 h-3" />
        <span>删除标注组</span>
      </button>
    </div>
  );
}

export function AnnotationEditor({
  session,
  fail,
}: {
  session: DocSession;
  fail: (e: unknown) => void;
}) {
  const editor = session.store.getState().editor!;
  const a = editor.annotation;
  const composing = useRef(false);
  const change = (text: string) => session.store.setState({ editor: { ...editor, text } });
  const cancel = () => session.store.setState({ editor: undefined });
  const save = () => {
    if (composing.current) return;
    if (editor.isNew && !editor.text.trim()) {
      cancel();
      return;
    }
    const value = { ...a, ...(a.type === 'freetext' ? { text: editor.text } : { contents: editor.text }) };
    session.store.setState({ editor: undefined });
    void session.put(value).catch(fail);
  };

  if (a.type === 'note') {
    return (
      <div className="absolute inset-0 z-30 bg-slate-900/15 backdrop-blur-[1px]" onPointerDown={(e) => e.stopPropagation()}>
        <StickyNoteCard
          author={a.author}
          date={a.createdAt.slice(0, 10)}
          content={editor.text}
          editImmediately
          controlledDraft={editor.text}
          onDraftChange={change}
          onUpdateContent={(text) => {
            change(text);
            session.store.setState({ editor: undefined });
            void session.put({ ...a, contents: text }).catch(fail);
          }}
          onDelete={() => {
            cancel();
            if (!editor.isNew) void session.remove(a.id).catch(fail);
          }}
          onClose={save}
          onCancel={cancel}
          position={{ x: 24, y: 24 }}
        />
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-30 bg-slate-900/20 backdrop-blur-[2px] flex items-start justify-center pt-12"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="animate-surface-in bg-white border border-slate-200/90 rounded-2xl shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22)] w-[400px] max-w-[calc(100%-32px)] p-5"
        role="dialog"
        aria-label="编辑批注"
      >
        <p className="text-[14.5px] font-semibold text-[#1f2329] mb-3">
          {a.type === 'freetext' ? '文字批注' : '标注评论'}
        </p>
        <textarea
          aria-label="批注内容"
          autoFocus
          className="border border-slate-200 rounded-xl p-3 w-full h-28 text-[13px] text-[#1f2329] bg-[#f8fafc] focus:bg-white focus:outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-500/12 resize-none transition-all"
          maxLength={20000}
          value={editor.text}
          onChange={(e) => change(e.target.value)}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => (composing.current = false)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent.isComposing || composing.current) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              save();
            }
          }}
        />
        {a.type === 'freetext' && (
          <div className="flex flex-wrap gap-2.5 text-[12px] text-[#5f6672] my-3 items-center">
            <label className="flex items-center gap-1.5">
              <span>字号</span>
              <input
                aria-label="批注字号"
                type="number"
                min="6"
                max="96"
                className="w-14 h-7 border border-slate-200 rounded-lg px-2 text-[#1f2329] focus:outline-hidden focus:border-blue-500"
                value={a.fontSize}
                onChange={(e) =>
                  session.store.setState({
                    editor: {
                      ...editor,
                      annotation: { ...a, fontSize: Math.max(6, Math.min(96, Number(e.target.value) || 14)) },
                    },
                  })
                }
              />
            </label>
            <CustomSelect
              ariaLabel="批注字体"
              size="xs"
              value={a.fontFamily ?? 'sans-serif'}
              onChange={(v) =>
                session.store.setState({ editor: { ...editor, annotation: { ...a, fontFamily: v } } })
              }
              options={[
                { value: 'sans-serif', label: '无衬线' },
                { value: 'serif', label: '衬线' },
              ]}
            />
            <CustomSelect
              ariaLabel="批注对齐"
              size="xs"
              value={a.alignment ?? 'left'}
              onChange={(v) =>
                session.store.setState({
                  editor: {
                    ...editor,
                    annotation: { ...a, alignment: v as Annotation['alignment'] },
                  },
                })
              }
              options={[
                { value: 'left', label: '左对齐' },
                { value: 'center', label: '居中' },
                { value: 'right', label: '右对齐' },
              ]}
            />
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4 text-[13px]">
          <button
            type="button"
            onClick={cancel}
            className="px-3.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
          >
            取消编辑
          </button>
          <button
            type="button"
            onClick={save}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-all active:scale-95"
          >
            保存批注
          </button>
        </div>
      </div>
    </div>
  );
}
