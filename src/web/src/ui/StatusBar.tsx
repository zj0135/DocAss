import React, { useState } from 'react';
import type { DocTab } from '../types';
import { FileText, CheckCircle2, Minus, Plus, X, Scan } from 'lucide-react';

interface StatusBarProps {
  activeTab?: DocTab;
  onPageChange: (page: number) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  isSaved?: boolean;
  saveState?: 'pending' | 'saving' | 'saved' | 'error';
  onCancelOcr?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activeTab,
  onPageChange,
  scale,
  onScaleChange,
  isSaved = true,
  saveState,
  onCancelOcr,
}) => {
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const [pageError, setPageError] = useState('');

  if (!activeTab) {
    return (
      <footer className="h-[28px] bg-white border-t border-[#e3e6ea] px-3 flex items-center justify-between text-[12px] text-slate-500 select-none flex-shrink-0 z-20">
        <span>就绪</span>
        <span>DocAss v0.2</span>
      </footer>
    );
  }

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = Number(pageInput);
    if (
      /^\d+$/.test(pageInput) &&
      Number.isInteger(pageNum) &&
      pageNum >= 1 &&
      pageNum <= activeTab.pageCount
    ) {
      onPageChange(pageNum);
      setPageError('');
      setIsEditingPage(false);
    } else {
      setPageError(`请输入 1–${activeTab.pageCount} 之间的整数`);
    }
  };

  const getTextSourceLabel = (src: 'native' | 'ocr' | 'hybrid') => {
    switch (src) {
      case 'native':
        return '原生文字';
      case 'ocr':
        return '文字识别';
      case 'hybrid':
        return '混合文字';
    }
  };

  return (
    <footer className="h-[28px] bg-white border-t border-[#e3e6ea] px-4 flex items-center justify-between text-[12px] text-slate-600 select-none flex-shrink-0 z-20">
      {/* Left: Page Number Jump */}
      <div className="flex items-center space-x-1">
        {isEditingPage ? (
          <form onSubmit={handlePageSubmit} className="flex items-center">
            <span className="text-slate-500 mr-1">第</span>
            <input
              aria-label="页码"
              aria-invalid={!!pageError}
              type="text"
              value={pageInput}
              onChange={e => setPageInput(e.target.value)}
              onBlur={() => setIsEditingPage(false)}
              autoFocus
              className="w-10 text-center text-[12px] px-1 py-0.5 border border-blue-500 rounded bg-blue-50/50 font-mono text-slate-800 focus:outline-hidden"
            />
            <span className="text-slate-500 ml-1">/ {activeTab.pageCount} 页</span>
            {pageError && (
              <span role="alert" className="ml-2 text-red-600">
                {pageError}
              </span>
            )}
          </form>
        ) : (
          <button
            onClick={() => {
              setPageInput(String(activeTab.currentPage));
              setIsEditingPage(true);
            }}
            className="hover:bg-slate-100 px-2 py-0.5 rounded text-slate-700 hover:text-blue-600 transition-colors cursor-pointer font-mono font-medium"
            title="点击输入页码跳转"
          >
            第 {activeTab.currentPage} / {activeTab.pageCount} 页
          </button>
        )}
      </div>

      {/* Center: Zoom Controls */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onScaleChange(Math.max(0.5, scale - 0.25))}
          className="p-1 rounded hover:bg-slate-100 text-slate-500"
          title="缩小"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="font-mono font-medium text-slate-700 min-w-[42px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => onScaleChange(Math.min(3.0, scale + 0.25))}
          className="p-1 rounded hover:bg-slate-100 text-slate-500"
          title="放大"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Right: Status by Priority (Image 1, 2, 4) */}
      <div className="flex items-center space-x-2">
        {/* Priority 1: OCR In Progress (Image 4) */}
        {saveState === 'error' ? (
          <span role="status" data-testid="save-state" className="text-red-700">
            保存失败
          </span>
        ) : activeTab.ocrStatus?.isRecognizing ? (
          <div className="flex items-center space-x-2 text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
            <Scan className="w-3 h-3 animate-spin" />
            <span className="font-medium text-[11.5px]">
              文字识别中 {activeTab.ocrStatus.currentPage} / {activeTab.ocrStatus.totalPage} 页
            </span>
            <div className="w-16 bg-blue-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-1.5 rounded-full"
                style={{
                  width: `${(activeTab.ocrStatus.currentPage / activeTab.ocrStatus.totalPage) * 100}%`,
                }}
              />
            </div>
            {onCancelOcr && (
              <button
                onClick={onCancelOcr}
                className="hover:bg-blue-200 rounded p-0.5 text-blue-700"
                title="取消识别"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : saveState && saveState !== 'saved' ? (
          <span role="status" data-testid="save-state" className="text-amber-700">
            {saveState === 'pending' ? '待保存' : '保存中…'}
          </span>
        ) : isSaved ? (
          /* Priority 2: Auto-save Completed (Image 2) */
          <div className="flex items-center space-x-1.5 text-green-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            <span>已自动保存</span>
          </div>
        ) : (
          /* Priority 3: Text Source (Image 1) */
          <div className="flex items-center space-x-1.5 text-slate-500">
            <FileText className="w-3.5 h-3.5" />
            <span>{getTextSourceLabel(activeTab.textSource)}</span>
          </div>
        )}
      </div>
    </footer>
  );
};
