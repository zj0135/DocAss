import React from 'react';

interface SplitterProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  isDragging: boolean;
}

export const Splitter: React.FC<SplitterProps> = ({
  onMouseDown,
  onDoubleClick,
  isDragging,
}) => {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={`w-[6px] h-full cursor-col-resize relative flex items-center justify-center transition-colors flex-shrink-0 z-20 select-none ${
        isDragging ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-300'
      }`}
      title="拖动调整对话面板宽度，双击恢复默认 (35%)"
    >
      {/* 1px center hairline border */}
      <div className="w-[1px] h-full bg-[#e3e6ea] pointer-events-none" />

      {/* Tiny handle dots */}
      <div className="absolute flex flex-col space-y-1 pointer-events-none opacity-40">
        <div className="w-1 h-1 rounded-full bg-slate-500" />
        <div className="w-1 h-1 rounded-full bg-slate-500" />
        <div className="w-1 h-1 rounded-full bg-slate-500" />
      </div>
    </div>
  );
};
