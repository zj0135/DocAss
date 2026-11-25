import React from 'react';
import type { AnyAnnotation } from '../../types';
import {
  X,
  MessageSquare,
  Square as SquareIcon,
  ArrowUpRight,
  Trash2,
} from 'lucide-react';

interface AnnotationPanelProps {
  annotations: AnyAnnotation[];
  selectedAnnotationId?: string;
  onSelectAnnotation: (id: string, page: number) => void;
  onDeleteAnnotation: (id: string, e: React.MouseEvent) => void;
  onClose: () => void;
}

export const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
  onDeleteAnnotation,
  onClose,
}) => {
  // Group annotations by page
  const groupedAnnotations = React.useMemo(() => {
    const groups: { [page: number]: AnyAnnotation[] } = {};
    annotations.forEach((ann) => {
      if (!groups[ann.page]) {
        groups[ann.page] = [];
      }
      groups[ann.page].push(ann);
    });
    return Object.entries(groups).sort(([pA], [pB]) => Number(pA) - Number(pB));
  }, [annotations]);

  const renderIcon = (ann: AnyAnnotation) => {
    switch (ann.type) {
      case 'highlight':
        return (
          <div
            className="w-3.5 h-3.5 rounded-xs flex-shrink-0"
            style={{ backgroundColor: ann.color }}
          />
        );
      case 'underline':
        return (
          <div
            className="w-3.5 h-1 border-b-2 flex-shrink-0"
            style={{ borderColor: ann.color }}
          />
        );
      case 'note':
        return (
          <MessageSquare
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: ann.color }}
          />
        );
      case 'rect':
        return (
          <SquareIcon
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: ann.color }}
          />
        );
      case 'freetext':
        return (
          <div
            className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[8px] font-bold flex-shrink-0"
            style={{ color: ann.color }}
          >
            T
          </div>
        );
      case 'arrow':
        return (
          <ArrowUpRight
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: ann.color }}
          />
        );
      default:
        return (
          <div className="w-3.5 h-3.5 rounded-xs flex-shrink-0 bg-blue-500" />
        );
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'highlight':
        return '高亮';
      case 'underline':
        return '下划线';
      case 'note':
        return '便签';
      case 'rect':
        return '矩形';
      case 'freetext':
        return '图注';
      case 'arrow':
        return '箭头';
      default:
        return '标注';
    }
  };

  return (
    <aside className="w-[280px] bg-white border-r border-[#e3e6ea] flex flex-col flex-shrink-0 z-10 animate-in slide-in-from-left-2 duration-150">
      {/* Header */}
      <div className="h-[44px] px-3.5 border-b border-[#e3e6ea] flex items-center justify-between flex-shrink-0">
        <span className="text-[13px] font-semibold text-[#1f2329]">
          标注 ({annotations.length})
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-[#5f6672] hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Grouped List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {groupedAnnotations.length === 0 ? (
          <div className="text-center py-8 text-[13px] text-[#8a9099]">
            暂无标注，在页面上选中文本或绘制图形添加
          </div>
        ) : (
          groupedAnnotations.map(([pageStr, items]) => {
            const pageNum = Number(pageStr);
            return (
              <div key={pageNum} className="space-y-1">
                {/* Page Group Header */}
                <div className="px-2 py-1 text-[11px] font-semibold text-[#8a9099] uppercase tracking-wider">
                  第 {pageNum} 页 ({items.length})
                </div>

                {/* Annotation Items */}
                {items.map((ann) => {
                  const isSelected = ann.id === selectedAnnotationId;
                  const label = getTypeLabel(ann.type);
                  const displayText = ann.summaryText.replace(/^(高亮|下划线|便签|矩形|图注|箭头)\s*/, '');

                  return (
                    <div
                      key={ann.id}
                      onClick={() => onSelectAnnotation(ann.id, ann.page)}
                      className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer text-[12.5px] transition-all ${
                        isSelected
                          ? 'bg-blue-50/80 text-blue-700 font-medium border border-blue-200'
                          : 'text-[#1f2329] hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate mr-2 flex-1">
                        {renderIcon(ann)}
                        <span className="text-[#5f6672] font-normal text-[11.5px] flex-shrink-0">
                          {label}
                        </span>
                        <span className="truncate text-[#1f2329]">{displayText}</span>
                      </div>

                      <div className="flex items-center space-x-1.5 flex-shrink-0">
                        <span className="text-[10px] text-[#8a9099] font-mono px-1.5 py-0.5 rounded bg-slate-100 group-hover:bg-white">
                          P{ann.page}
                        </span>
                        <button
                          onClick={(e) => onDeleteAnnotation(ann.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-opacity"
                          title="删除标注"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
