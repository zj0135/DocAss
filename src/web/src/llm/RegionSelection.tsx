import { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Box, PageInfo } from '../contracts';
import { viewport, inverse, point } from '../documents/geometry';
import type { ChatSession } from './ChatSession';

export function RegionSelection({
  info,
  scale,
  rotation,
  chat,
  onCancel,
}: {
  info: PageInfo;
  scale: number;
  rotation: number;
  chat: ChatSession;
  onCancel: () => void;
}) {
  const [rect, setRect] = useState<Box>();
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ start: [number, number]; rect?: Box; handle?: number } | undefined>(undefined);
  const host = useRef<HTMLDivElement>(null);
  const view = viewport(info, scale, rotation);

  const position = (e: React.PointerEvent): [number, number] => {
    const b = host.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(view.width, e.clientX - b.left)),
      Math.max(0, Math.min(view.height, e.clientY - b.top)),
    ];
  };

  return (
    <div
      ref={host}
      data-testid="region-selection"
      className="absolute inset-0 cursor-crosshair z-20"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (busy || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const index = (e.target as HTMLElement).dataset.handle;
        drag.current = {
          start: position(e),
          rect,
          handle: index === undefined ? undefined : Number(index),
        };
        if (index === undefined) setRect(undefined);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        const d = drag.current;
        if (!d) return;
        const p = position(e);
        let b: Box;
        if (d.handle !== undefined && d.rect) {
          b = [...d.rect];
          const h = d.handle;
          if ([0, 6, 7].includes(h)) b[0] = p[0];
          if ([0, 1, 2].includes(h)) b[1] = p[1];
          if ([2, 3, 4].includes(h)) b[2] = p[0];
          if ([4, 5, 6].includes(h)) b[3] = p[1];
        } else {
          b = [d.start[0], d.start[1], p[0], p[1]];
        }
        setRect([Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])]);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        drag.current = undefined;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={() => {
        drag.current = undefined;
        setRect(undefined);
      }}
    >
      {rect && rect[2] - rect[0] > 3 && rect[3] - rect[1] > 3 && (
        <div
          className="absolute border-2 border-dashed border-blue-600 bg-blue-500/5 rounded-xs"
          style={{
            left: rect[0],
            top: rect[1],
            width: rect[2] - rect[0],
            height: rect[3] - rect[1],
          }}
        >
          {[
            [0, 0],
            [50, 0],
            [100, 0],
            [100, 50],
            [100, 100],
            [50, 100],
            [0, 100],
            [0, 50],
          ].map(([x, y], i) => (
            <span
              key={i}
              data-handle={i}
              className="absolute w-2.5 h-2.5 bg-white border-2 border-blue-600 -translate-x-1/2 -translate-y-1/2 shadow-2xs"
              style={{ left: `${x}%`, top: `${y}%`, cursor: 'move' }}
            />
          ))}

          <div
            className="absolute right-0 bg-white border border-[#e3e6ea] rounded-xl shadow-lg px-2 py-1.5 flex items-center space-x-2 text-[12.5px] whitespace-nowrap z-30"
            style={rect[3] > view.height - 48 ? { bottom: 8 } : { top: 'calc(100% + 10px)' }}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const transform = inverse(view.transform);
                const corners = [
                  [rect[0], rect[1]],
                  [rect[2], rect[1]],
                  [rect[2], rect[3]],
                  [rect[0], rect[3]],
                ].map((p) => point(transform, p as [number, number]));
                const b: Box = [
                  Math.max(info.pageBox[0], Math.min(...corners.map((p) => p[0]))),
                  Math.max(info.pageBox[1], Math.min(...corners.map((p) => p[1]))),
                  Math.min(info.pageBox[2], Math.max(...corners.map((p) => p[0]))),
                  Math.min(info.pageBox[3], Math.max(...corners.map((p) => p[1]))),
                ];
                setBusy(true);
                void chat
                  .addRegion(info.page, b)
                  .then(onCancel)
                  .catch((e) => chat.store.setState({ error: String(e) }))
                  .finally(() => setBusy(false));
              }}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{busy ? '正在生成附件…' : '问 AI'}</span>
            </button>
            <div className="w-[1px] h-4 bg-slate-200" />
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
