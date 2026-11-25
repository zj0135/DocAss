import React from 'react';
import {
  Highlighter,
  Underline as UnderlineIcon,
  MessageSquare,
  Copy,
  Sparkles,
} from 'lucide-react';

interface FloatingBarProps {
  position: { x: number; y: number };
  onHighlight: () => void;
  onUnderline: () => void;
  onAddNote: () => void;
  onCopy: () => void;
  onAskAi: () => void;
}

export const FloatingBar: React.FC<FloatingBarProps> = ({
  position,
  onHighlight,
  onUnderline,
  onAddNote,
  onCopy,
  onAskAi,
}) => {
  return (
    <div
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)',
      }}
      className="absolute z-40 bg-white border border-[#e3e6ea] rounded-xl shadow-lg px-1.5 py-1 flex items-center space-x-1 select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Highlight Button */}
      <button
        onClick={onHighlight}
        className="p-1.5 rounded-lg text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329] transition-colors"
        title="高亮选中文本"
      >
        <Highlighter className="w-3.5 h-3.5 text-amber-500" />
      </button>

      {/* Underline Button */}
      <button
        onClick={onUnderline}
        className="p-1.5 rounded-lg text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329] transition-colors"
        title="添加下划线"
      >
        <UnderlineIcon className="w-3.5 h-3.5 text-blue-600" />
      </button>

      {/* Note Button */}
      <button
        onClick={onAddNote}
        className="p-1.5 rounded-lg text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329] transition-colors"
        title="添加便签批注"
      >
        <MessageSquare className="w-3.5 h-3.5 text-orange-500" />
      </button>

      {/* Copy Button */}
      <button
        onClick={onCopy}
        className="p-1.5 rounded-lg text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329] transition-colors"
        title="复制文本"
      >
        <Copy className="w-3.5 h-3.5 text-slate-600" />
      </button>

      <div className="w-[1px] h-3.5 bg-slate-200 mx-0.5" />

      {/* Ask AI Button */}
      <button
        onClick={onAskAi}
        className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100/80 text-blue-600 text-[12px] font-medium transition-colors"
        title="把选中文字作为引用发送给 AI"
      >
        <Sparkles className="w-3 h-3 text-blue-600" />
        <span>问 AI</span>
      </button>
    </div>
  );
};
