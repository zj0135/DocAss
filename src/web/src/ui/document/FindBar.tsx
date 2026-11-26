import React, { useState } from 'react';
import {
  Search,
  ChevronUp,
  ChevronDown,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface FindBarProps {
  isOpen: boolean;
  onClose: () => void;
  unrecognizedPages?: number;
  onRecognizeAll?: () => void;
  currentMatchIndex: number;
  totalMatches: number;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
}

export const FindBar: React.FC<FindBarProps> = ({
  isOpen,
  onClose,
  unrecognizedPages = 0,
  onRecognizeAll,
  currentMatchIndex,
  totalMatches,
  onNextMatch,
  onPrevMatch,
  searchTerm,
  onSearchTermChange,
}) => {
  const [isRecognizing, setIsRecognizing] = useState(false);

  if (!isOpen) return null;

  const handleRecognizeClick = () => {
    setIsRecognizing(true);
    setTimeout(() => {
      setIsRecognizing(false);
      if (onRecognizeAll) onRecognizeAll();
    }, 2000);
  };

  return (
    <div className="absolute top-3 right-5 z-40 w-[360px] bg-white border border-[#e3e6ea] rounded-xl shadow-lg p-2 animate-in fade-in slide-in-from-top-2 duration-150 select-none">
      {/* Row 1: Search Input & Controls */}
      <div className="flex items-center space-x-2">
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0 ml-1" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          placeholder="在文档中查找..."
          autoFocus
          className="flex-1 text-[13px] text-[#1f2329] focus:outline-hidden placeholder:text-slate-400"
        />

        {/* Matches count */}
        <span className="text-[12px] text-slate-500 font-mono flex-shrink-0 px-1">
          {totalMatches > 0 ? `${currentMatchIndex} / ${totalMatches}` : '无结果'}
        </span>

        {/* Up/Down Chevrons */}
        <button
          onClick={onPrevMatch}
          disabled={totalMatches === 0}
          className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
          title="上一个 (Shift+F3)"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onNextMatch}
          disabled={totalMatches === 0}
          className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
          title="下一个 (F3)"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title="关闭 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Row 2: Unrecognized OCR Warning (Image 4) */}
      {unrecognizedPages > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11.5px] px-1 bg-amber-50/70 -mx-1 -mb-1 p-1.5 rounded-b-lg">
          <div className="flex items-center space-x-1.5 text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span>还有 {unrecognizedPages} 页尚未识别</span>
          </div>
          {onRecognizeAll&&<button
            onClick={handleRecognizeClick}
            disabled={isRecognizing}
            className="text-blue-600 hover:text-blue-700 font-medium px-2 py-0.5 rounded hover:bg-blue-50 transition-colors flex items-center space-x-1"
          >
            {isRecognizing && <Loader2 className="w-3 h-3 animate-spin" />}
            <span>{isRecognizing ? '正在识别...' : '全部识别'}</span>
          </button>}
        </div>
      )}
    </div>
  );
};
