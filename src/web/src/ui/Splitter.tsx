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
      className={`group w-[7px] h-full cursor-col-resize relative flex items-center justify-center transition-colors flex-shrink-0 z-20 select-none ${
        isDragging ? 'bg-blue-500/15' : 'bg-transparent hover:bg-blue-500/10'
      }`}
      title="拖动调整对话面板宽度，双击恢复默认 (35%)"
    >
      {/* 1px hairline border transitioning to blue accent */}
      <div
        className={`w-[1px] h-full pointer-events-none transition-colors ${
          isDragging ? 'bg-blue-500 w-[2px]' : 'bg-[#e3e6ea] group-hover:bg-blue-400'
        }`}
      />

      {/* Tactile center pill grip */}
      <div
        className={`absolute w-1 h-8 rounded-full pointer-events-none transition-all duration-150 ${
          isDragging
            ? 'bg-blue-600 scale-y-110 opacity-100'
            : 'bg-slate-400/50 opacity-0 group-hover:opacity-100'
        }`}
      />
    </div>
  );
};
