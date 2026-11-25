import React from 'react';
import { X } from 'lucide-react';

interface ThumbnailPanelProps {
  pageCount: number;
  currentPage: number;
  onSelectPage: (page: number) => void;
  onClose: () => void;
}

export const ThumbnailPanel: React.FC<ThumbnailPanelProps> = ({
  pageCount,
  currentPage,
  onSelectPage,
  onClose,
}) => {
  // Generate mock thumbnails up to pageCount (or up to 16 for preview)
  const displayPages = Array.from({ length: Math.min(pageCount, 16) }, (_, i) => i + 1);

  return (
    <aside className="w-[280px] bg-white border-r border-[#e3e6ea] flex flex-col flex-shrink-0 z-10 animate-in slide-in-from-left-2 duration-150">
      {/* Header */}
      <div className="h-[44px] px-3.5 border-b border-[#e3e6ea] flex items-center justify-between flex-shrink-0">
        <span className="text-[13px] font-semibold text-[#1f2329]">
          页面缩略图 ({pageCount} 页)
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-[#5f6672] hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Thumbnails Grid/List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {displayPages.map((page) => {
          const isSelected = page === currentPage;

          return (
            <div
              key={page}
              onClick={() => onSelectPage(page)}
              className={`group flex flex-col items-center p-2 rounded-xl cursor-pointer transition-all ${
                isSelected
                  ? 'bg-blue-50/60 ring-2 ring-blue-600 shadow-sm'
                  : 'hover:bg-slate-50'
              }`}
            >
              {/* Thumbnail Paper Mockup */}
              <div
                className={`w-[190px] h-[135px] bg-white rounded-md shadow-xs border flex flex-col p-2.5 relative overflow-hidden transition-all ${
                  isSelected ? 'border-blue-500' : 'border-[#e3e6ea] group-hover:border-slate-300'
                }`}
              >
                {/* Mock Page Content Preview */}
                <div className="w-12 h-2 bg-slate-300 rounded-sm mb-2" />
                <div className="space-y-1 mb-2">
                  <div className="w-full h-1.5 bg-slate-150 bg-slate-200 rounded-xs" />
                  <div className="w-4/5 h-1.5 bg-slate-200 rounded-xs" />
                  <div className="w-11/12 h-1.5 bg-slate-200 rounded-xs" />
                </div>
                {/* Mock Chart or Graphic */}
                <div className="mt-auto h-12 w-full bg-slate-50 rounded border border-slate-150 border-dashed flex items-end justify-center space-x-1.5 pb-1">
                  <div className="w-3 bg-blue-400 rounded-t-xs" style={{ height: `${20 + (page * 7) % 25}px` }} />
                  <div className="w-3 bg-blue-500 rounded-t-xs" style={{ height: `${15 + (page * 9) % 30}px` }} />
                  <div className="w-3 bg-blue-600 rounded-t-xs" style={{ height: `${25 + (page * 5) % 20}px` }} />
                </div>

                {isSelected && (
                  <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-600 text-white font-medium">
                    当前
                  </div>
                )}
              </div>

              {/* Page Number Label */}
              <span
                className={`text-[12px] mt-1.5 font-medium ${
                  isSelected ? 'text-blue-600' : 'text-[#5f6672]'
                }`}
              >
                第 {page} 页
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
