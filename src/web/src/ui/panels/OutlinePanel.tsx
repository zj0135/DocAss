import React from 'react';
import type { OutlineItem } from '../../types';
import { X, ChevronRight, ChevronDown, Bookmark } from 'lucide-react';

interface OutlinePanelProps {
  outline: OutlineItem[];
  currentPage: number;
  onSelectPage: (page: number) => void;
  onClose: () => void;
}

export const OutlinePanel: React.FC<OutlinePanelProps> = ({
  outline,
  currentPage,
  onSelectPage,
  onClose,
}) => {
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(
    new Set(['out-1', 'out-2'])
  );

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderItem = (item: OutlineItem, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const isCurrent = currentPage === item.page;

    return (
      <div key={item.id} className="select-none">
        <div
          onClick={() => onSelectPage(item.page)}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          className={`flex items-center justify-between py-1.5 pr-2.5 rounded-lg cursor-pointer text-[13px] transition-colors ${
            isCurrent
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#1f2329] hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center space-x-1.5 truncate">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(item.id, e)}
                className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <div className="w-4 h-4 flex items-center justify-center text-slate-400">
                <Bookmark className="w-3 h-3" />
              </div>
            )}
            <span className="truncate">{item.title}</span>
          </div>

          <span className="text-[11px] text-[#8a9099] font-mono ml-2 flex-shrink-0">
            P{item.page}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-0.5 space-y-0.5">
            {item.children!.map((child) => renderItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      aria-label="目录大纲"
      className="w-[280px] bg-white border-r border-[#e3e6ea] flex flex-col flex-shrink-0 z-10"
    >
      {/* Header */}
      <div className="h-[44px] px-3.5 border-b border-[#e3e6ea] flex items-center justify-between flex-shrink-0">
        <span className="text-[13px] font-semibold text-[#1f2329]">目录大纲</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭目录大纲"
          className="p-1 rounded-md text-[#5f6672] hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {outline.length === 0 ? (
          <div className="text-center py-8 text-[13px] text-[#8a9099]">
            此文档没有大纲
          </div>
        ) : (
          outline.map((item) => renderItem(item))
        )}
      </div>
    </aside>
  );
};
