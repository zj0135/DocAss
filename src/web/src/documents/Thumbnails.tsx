import { useState, useEffect } from 'react';
import type { PagedDocument } from './types';
import type { PageInfo } from '../contracts';
import { PageView } from './PageView';

export function Thumbnails({
  document,
  current,
  onSelect,
}: {
  document: PagedDocument;
  current: number;
  onSelect: (page: number) => void;
}) {
  const [top, setTop] = useState(0);
  const [infos, setInfos] = useState<Record<number, PageInfo>>({});
  const rowHeight = 236;
  const first = Math.max(1, Math.floor(top / rowHeight) - 1);
  const last = Math.min(document.pageCount, first + 7);

  useEffect(() => {
    let active = true;
    void (async () => {
      for (let page = first; page <= last; page++) {
        const info = await document.getPageInfo(page);
        if (active) setInfos(old => ({ ...old, [page]: info }));
      }
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [first, last, document]);

  return (
    <div
      aria-label="缩略图"
      className="flex-1 min-h-0 overflow-y-auto p-3"
      onScroll={e => setTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: document.pageCount * rowHeight, position: 'relative' }}>
        {Array.from({ length: last - first + 1 }, (_, i) => first + i).map(page => {
          const info = infos[page];
          const isSelected = page === current;
          return (
            <button
              key={page}
              type="button"
              aria-label={`跳转第 ${page} 页`}
              onClick={() => onSelect(page)}
              style={{
                position: 'absolute',
                top: (page - 1) * rowHeight,
                left: 8,
                right: 8,
                height: rowHeight - 10,
              }}
              className={`group flex flex-col items-center justify-center p-2 rounded-xl cursor-pointer transition-all ${
                isSelected
                  ? 'bg-blue-50/60 ring-2 ring-blue-600 shadow-sm'
                  : 'hover:bg-slate-50 border border-transparent'
              }`}
            >
              <div className="flex-1 flex items-center justify-center overflow-hidden">
                {info ? (
                  <div className="rounded-md overflow-hidden border border-[#e3e6ea] bg-white shadow-2xs">
                    <PageView
                      document={document}
                      info={info}
                      scale={(172 / Math.max(info.width, info.height)) * (72 / 96)}
                      rotation={0}
                      dpr={1}
                      priority={100 + page}
                      thumbnail
                    />
                  </div>
                ) : (
                  <div className="w-[140px] h-[180px] rounded-md border border-[#e3e6ea] bg-slate-50 animate-pulse" />
                )}
              </div>
              <span
                className={`text-[12px] mt-1.5 font-medium ${
                  isSelected ? 'text-blue-600' : 'text-[#5f6672]'
                }`}
              >
                {page}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
