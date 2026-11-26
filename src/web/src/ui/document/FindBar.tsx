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
  coverage?: { searched: number; total: number; unavailable: number };
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
  coverage,
}) => {
  const [isRecognizing, setIsRecognizing] = useState(false);

  if (!isOpen) return null;

  const handleRecognizeClick = () => {
    if (!onRecognizeAll) return;
    setIsRecognizing(true);
    Promise.resolve(onRecognizeAll()).finally(() => setIsRecognizing(false));
  };

  return (
    <div className="absolute top-3 right-5 z-40 w-[370px] bg-white border border-[#e3e6ea] rounded-xl shadow-lg p-2 select-none">
      {/* Row 1: Search Input & Controls */}
      <div className="flex items-center space-x-2">
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0 ml-1" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          placeholder="在文档中查找..."
          autoFocus
          className="flex-1 text-[13px] text-[#1f2329] focus:outline-hidden placeholder:text-slate-400 min-w-0"
        />

        {/* Matches count */}
        <span className="text-[12px] text-slate-500 font-mono flex-shrink-0 px-1">
          {totalMatches > 0 ? `${currentMatchIndex} / ${totalMatches}` : '无结果'}
        </span>

        {/* Up/Down Chevrons */}
        <button
          type="button"
          onClick={onPrevMatch}
          disabled={totalMatches === 0}
          className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
          title="上一个 (Shift+F3)"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onNextMatch}
          disabled={totalMatches === 0}
          className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
          title="下一个 (F3)"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title="关闭 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Row 2: Search coverage / Unrecognized OCR Warning (Image 4) */}
      {(coverage || unrecognizedPages > 0) && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11.5px] px-2 bg-amber-50/70 -mx-2 -mb-2 py-1.5 rounded-b-xl">
          <div className="flex items-center space-x-1.5 text-amber-800">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            {coverage ? (
              <span data-testid="search-coverage">
                已搜索 {coverage.searched}/{coverage.total} 页 · 待识别 {coverage.unavailable} 页
              </span>
            ) : (
              <span>还有 {unrecognizedPages} 页尚未识别</span>
            )}
          </div>
          {onRecognizeAll && (coverage ? coverage.unavailable > 0 : unrecognizedPages > 0) && (
            <button
              type="button"
              onClick={handleRecognizeClick}
              disabled={isRecognizing}
              className="text-blue-600 hover:text-blue-700 font-medium px-2 py-0.5 rounded hover:bg-blue-50 transition-colors flex items-center space-x-1 flex-shrink-0"
            >
              {isRecognizing && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>{isRecognizing ? '正在识别...' : '全部识别'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
