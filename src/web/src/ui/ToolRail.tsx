import React from 'react';
import type { SidePanelType } from '../types';
import {
  MousePointer2,
  LayoutGrid,
  ListTree,
  Tag,
} from 'lucide-react';

interface ToolRailProps {
  activePanel: SidePanelType;
  onTogglePanel: (panel: SidePanelType) => void;
  onSelectPointer: () => void;
  isPointerActive: boolean;
  annotationCount: number;
}

export const ToolRail: React.FC<ToolRailProps> = ({
  activePanel,
  onTogglePanel,
  onSelectPointer,
  isPointerActive,
  annotationCount,
}) => {
  return (
    <div className="w-[48px] bg-white border-r border-[#e3e6ea] flex flex-col items-center py-2.5 space-y-2 select-none flex-shrink-0 z-20">
      {/* Selection / Pointer */}
      <button
        onClick={onSelectPointer}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
          isPointerActive && activePanel === 'none'
            ? 'bg-blue-50 text-blue-600'
            : 'text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329]'
        }`}
        title="选择工具"
      >
        <MousePointer2 className="w-[18px] h-[18px]" />
      </button>

      {/* Thumbnails Panel Toggle */}
      <button
        onClick={() => onTogglePanel('thumbnails')}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative ${
          activePanel === 'thumbnails'
            ? 'bg-blue-50 text-blue-600 font-medium'
            : 'text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329]'
        }`}
        title="页面缩略图"
      >
        <LayoutGrid className="w-[18px] h-[18px]" />
      </button>

      {/* Outline / Table of Contents Panel Toggle */}
      <button
        onClick={() => onTogglePanel('outline')}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
          activePanel === 'outline'
            ? 'bg-blue-50 text-blue-600 font-medium'
            : 'text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329]'
        }`}
        title="目录大纲"
      >
        <ListTree className="w-[18px] h-[18px]" />
      </button>

      {/* Annotation List Panel Toggle */}
      <button
        onClick={() => onTogglePanel('annotations')}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative ${
          activePanel === 'annotations'
            ? 'bg-blue-50 text-blue-600 font-medium'
            : 'text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329]'
        }`}
        title={`标注列表 (${annotationCount})`}
      >
        <Tag className="w-[18px] h-[18px]" />
        {annotationCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-600 ring-1 ring-white" />
        )}
      </button>
    </div>
  );
};
