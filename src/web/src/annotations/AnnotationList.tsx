import { useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation } from '../contracts';
import {
  X,
  MessageSquare,
  Square as SquareIcon,
  ArrowUpRight,
  PenLine,
  Trash2,
} from 'lucide-react';

const labels: Record<Annotation['type'], string> = {
  highlight: '高亮',
  underline: '下划线',
  note: '便签',
  freetext: '图注',
  ink: '手绘',
  rect: '矩形',
  arrow: '箭头',
};

function renderIcon(a: Annotation) {
  switch (a.type) {
    case 'highlight':
      return (
        <div
          className="w-3.5 h-3.5 rounded-xs flex-shrink-0"
          style={{ backgroundColor: a.color }}
        />
      );
    case 'underline':
      return (
        <div
          className="w-3.5 h-1 border-b-2 flex-shrink-0"
          style={{ borderColor: a.color }}
        />
      );
    case 'note':
      return <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" style={{ color: a.color }} />;
    case 'rect':
      return <SquareIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: a.color }} />;
    case 'freetext':
      return (
        <div
          className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[8px] font-bold flex-shrink-0"
          style={{ color: a.color }}
        >
          T
        </div>
      );
    case 'arrow':
      return <ArrowUpRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: a.color }} />;
    case 'ink':
      return <PenLine className="w-3.5 h-3.5 flex-shrink-0" style={{ color: a.color }} />;
  }
}

export function AnnotationList({
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
  onDeleteAnnotation,
  onClose,
  pageCount,
}: {
  annotations: Annotation[];
  selectedAnnotationId?: string;
  onSelectAnnotation: (id: string, page: number) => void;
  onDeleteAnnotation: (id: string, e: React.MouseEvent) => void;
  onClose: () => void;
  pageCount: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(700);

  const items = useMemo(
    () =>
      [...annotations].sort(
        (a, b) =>
          (a.migrationState === 'needsReview' ? 1 : 0) -
            (b.migrationState === 'needsReview' ? 1 : 0) ||
          a.page - b.page ||
          a.createdAt.localeCompare(b.createdAt)
      ),
    [annotations]
  );

  useEffect(() => {
    const el = ref.current!;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const index = items.findIndex((a) => a.id === selectedAnnotationId);
    const el = ref.current;
    if (el && index >= 0 && (index * 72 < el.scrollTop || index * 72 + 72 > el.scrollTop + height)) {
      el.scrollTop = index * 72;
    }
  }, [selectedAnnotationId, items, height]);

  const start = Math.max(0, Math.floor(top / 72) - 2);
  const visible = items.slice(start, start + Math.ceil(height / 72) + 4);

  return (
    <aside
      className="w-[280px] bg-white border-r border-[#e3e6ea] flex flex-col shrink-0 z-10"
      aria-label="标注列表"
    >
      <div className="h-[44px] px-3.5 border-b border-[#e3e6ea] flex items-center justify-between flex-shrink-0">
        <span className="text-[13px] font-semibold text-[#1f2329]">标注 ({items.length})</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭标注列表"
          className="p-1 rounded-md text-[#5f6672] hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        ref={ref}
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
        className="flex-1 overflow-auto min-h-0 p-2"
        data-testid="annotation-list"
      >
        {!items.length ? (
          <p className="text-center py-8 text-[13px] text-[#8a9099]">
            暂无标注，在页面上选中文本或绘制图形添加
          </p>
        ) : (
          <div style={{ height: items.length * 72, position: 'relative' }}>
            {visible.map((a, i) => {
              const isSelected = a.id === selectedAnnotationId;
              const summary = a.contents || a.text || a.textAnchor?.quote || labels[a.type];
              const pageBadge =
                a.page > pageCount
                  ? '未定位'
                  : a.migrationState === 'needsReview'
                    ? '待复核'
                    : `P${a.page}`;

              return (
                <div
                  key={a.id}
                  data-annotation-id={a.id}
                  aria-selected={isSelected}
                  style={{ position: 'absolute', top: (start + i) * 72, left: 0, right: 0, height: 66 }}
                  onClick={() => onSelectAnnotation(a.id, a.page)}
                  className={`group flex flex-col justify-center px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50/80 text-blue-700 border border-blue-200'
                      : 'text-[#1f2329] hover:bg-slate-100 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      {renderIcon(a)}
                      <span className="text-[#5f6672] text-[11.5px] flex-shrink-0">
                        {labels[a.type]}
                      </span>
                      <span className="truncate text-[12.5px] font-medium text-[#1f2329]">
                        {summary}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          a.migrationState === 'needsReview'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-[#8a9099] group-hover:bg-white'
                        }`}
                      >
                        {pageBadge}
                      </span>
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-opacity"
                        aria-label="删除此标注"
                        title="删除标注"
                        onClick={(e) => onDeleteAnnotation(a.id, e)}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span className="sr-only">删除</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1 pl-5.5 text-[11px] text-[#8a9099]">
                    <span className="truncate">{a.author}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
