import React from 'react';
import { X } from 'lucide-react';
import type { PagedDocument } from '../../documents/types';
import { Thumbnails } from '../../documents/Thumbnails';

interface ThumbnailPanelProps {
  document: PagedDocument;
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
  document,
}) => {
  return (
    <aside className="animate-panel-in w-[280px] bg-white border-r border-[#e3e6ea] flex flex-col flex-shrink-0 z-10">
      <div className="h-[44px] px-3.5 border-b border-[#e3e6ea] flex items-center justify-between flex-shrink-0">
        <span className="text-[13px] font-semibold text-[#1f2329]">页面缩略图 ({pageCount} 页)</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭缩略图"
          className="p-1 rounded-lg text-[#5f6672] hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <Thumbnails document={document} current={currentPage} onSelect={onSelectPage} />
    </aside>
  );
};
