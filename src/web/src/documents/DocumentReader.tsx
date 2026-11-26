import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Sparkles, Highlighter, Underline as UnderlineIcon, Copy, ChevronLeft } from 'lucide-react';
import type { PageInfo, PageText, Quad } from '../contracts';
import type { DocSession } from '../state/DocSession';
import type { AppServices } from '../services/AppServices';
import type { PagedDocument, PasswordPrompt, OutlineEntry } from './types';
import type { DocumentPool } from './DocumentPool';
import type { ToolType } from '../types';
import { ByteLru } from './resources';
import { clientToPage, viewport, point } from './geometry';
import { PageView } from './PageView';
import { ThumbnailPanel } from '../ui/panels/ThumbnailPanel';
import { OutlinePanel } from '../ui/panels/OutlinePanel';
import { StatusBar } from '../ui/StatusBar';
import { FindBar } from '../ui/document/FindBar';
import { SearchController, searchPage } from '../text/search';
import type { SearchHit } from '../text/search';
import { copyText, rangeQuads, wordRange } from '../text/model';
import { HitIndex, selectedRange } from '../text/selection';
import type { Selection, TextPosition } from '../text/selection';
import { useAnnotations } from '../annotations/useAnnotations';
import type { Tool } from '../annotations/model';
import { AnnotationInspector, AnnotationEditor } from '../annotations/AnnotationControls';
import { AnnotationPanel } from '../ui/panels/AnnotationPanel';
import { VersionNotice } from '../annotations/VersionNotice';
import { OcrControls, OcrPageStatus } from '../ocr/OcrControls';
import { LiveChatPanel } from '../ui/chat/LiveChatPanel';
import { RegionSelection } from '../llm/RegionSelection';
import { verifiedCitationRanges } from '../llm/citations';
import { appStore } from '../state/appStore';
import { editingTarget, modalOpen } from '../ui/keyboard';
import { Splitter } from '../ui/Splitter';
import { Toolbar } from '../ui/Toolbar';
import { ToolRail } from '../ui/ToolRail';
import { ToastBanner } from '../ui/primitives/ToastBanner';

const textCache = new ByteLru<string, PageText>(16 * 1024 * 1024);
const estimate: PageInfo = { page: 1, pageBox: [0, 0, 595, 842], width: 595, height: 842, rotate: 0, userUnit: 1 };

export function DocumentReader({
  session,
  services,
  pool,
  prompt,
}: {
  session: DocSession;
  services: AppServices;
  pool: DocumentPool;
  prompt: PasswordPrompt;
}) {
  const state = useStore(session.store);
  const [document, setDocument] = useState<PagedDocument>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const recover = useCallback(() => {
    setError('');
    setDocument(undefined);
    void pool
      .recover()
      .then(() => setRetry((n) => n + 1))
      .catch(() => setError('阅读器重建失败，请关闭文档后重试。'));
  }, [pool]);

  useEffect(() => {
    const abort = new AbortController();
    let release: (() => void) | undefined;
    void pool
      .acquire(session.handle.docId, prompt, abort.signal)
      .then(
        (lease) => {
          if (abort.signal.aborted) {
            lease.release();
            return;
          }
          release = lease.release;
          setDocument(lease.document);
          session.store.setState({ pageCount: lease.document.pageCount });
        },
        () => {
          if (!abort.signal.aborted) setError('文档加载失败。可重建阅读器后重试。');
        }
      );
    return () => {
      abort.abort();
      release?.();
    };
  }, [session, pool, prompt, retry]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 canvas-backdrop" role="alert">
        <div className="animate-surface-in bg-white border border-slate-200/90 rounded-2xl p-6 shadow-lg text-sm text-slate-700 flex items-center gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={recover}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }
  if (!document) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 canvas-backdrop text-sm text-slate-500" role="status">
        正在加载文档…
      </div>
    );
  }
  return (
    <ReaderBody
      key={`${session.handle.docId}:${retry}`}
      session={session}
      services={services}
      document={document}
      page={state.page}
      recover={recover}
    />
  );
}

function ReaderBody({
  session,
  services,
  document,
  recover,
}: {
  session: DocSession;
  services: AppServices;
  document: PagedDocument;
  page: number;
  recover: () => void;
}) {
  const settings = useStore(appStore, (s) => s.settings);
  const [chatWidth, setChatWidth] = useState(appStore.getState().settings.chatWidth);
  const [chatCollapsed, setChatCollapsed] = useState(window.innerWidth < 1000);
  const [narrow, setNarrow] = useState(window.innerWidth < 1000);
  const [splitting, setSplitting] = useState(false);

  const savePreference = async (value: Partial<typeof settings>) => {
    try {
      const current = await services.settings.get();
      const next = await services.settings.update({ ...current, ...value });
      appStore.setState({ settings: next });
    } catch (e) {
      appStore.setState({ error: String(e) });
    }
  };

  useEffect(() => {
    setChatWidth(settings.chatWidth);
  }, [settings.chatWidth]);

  useEffect(() => {
    const resize = () => {
      const small = window.innerWidth < 1000;
      setNarrow(small);
      if (small) {
        setChatCollapsed(true);
        setPanel('none');
      }
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const startSplit = (e: React.MouseEvent) => {
    e.preventDefault();
    setSplitting(true);
    let width = chatWidth;
    const move = (ev: MouseEvent) => {
      width = Math.max(340, Math.min(640, window.innerWidth - ev.clientX));
      setChatWidth(width);
    };
    const end = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      setSplitting(false);
      void savePreference({ chatWidth: width });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end, { once: true });
  };

  const state = useStore(session.store);
  const scroller = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 700, dpr: devicePixelRatio });
  const [infos, setInfos] = useState<Record<number, PageInfo>>({});
  const [scroll, setScroll] = useState(0);
  const [panel, setPanel] = useState<'none' | 'thumbnails' | 'outline' | 'annotations'>('none');
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const [find, setFind] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [match, setMatch] = useState(0);
  const [coverage, setCoverage] = useState({ searched: 0, unavailable: 0 });
  const [texts, setTexts] = useState<Record<number, PageText>>({});
  const [selection, setSelection] = useState<Selection>();
  const [notice, setNotice] = useState('');

  const search = useMemo(() => new SearchController(), []);
  const drag = useRef<{ pointer: number; x: number; y: number } | undefined>(undefined);
  const selectionRef = useRef(selection);
  const life = useRef(new AbortController());
  const layoutRef = useRef<{ top: number; height: number }[]>([]);
  const restoring = useRef(false);
  const initial = useRef(true);

  useEffect(() => {
    setPanel(settings.sidePanel);
  }, []);

  const choosePanel = (next: typeof panel) => {
    setPanel(next);
    void savePreference({ sidePanel: next });
  };

  const clicks = useRef({ time: 0, x: 0, y: 0, count: 0 });
  const hitIndexes = useMemo(
    () => new Map(Object.values(texts).map((text) => [text.page, new HitIndex(text)])),
    [texts]
  );

  const stopDrag = useCallback((clear = false) => {
    const pointer = drag.current?.pointer;
    drag.current = undefined;
    if (pointer !== undefined && scroller.current?.hasPointerCapture(pointer)) {
      scroller.current.releasePointerCapture(pointer);
    }
    if (clear) setSelection(undefined);
  }, []);

  const [counts, setCounts] = useState<number[]>([]);
  const [currentHit, setCurrentHit] = useState<SearchHit>();
  const lastMatchJump = useRef('');
  const totalMatches = counts.reduce((a, b) => a + b, 0);
  selectionRef.current = selection;

  const info = infos[state.page] ?? infos[1] ?? estimate;
  const base = viewport(info, 1, state.rotation);
  const scale =
    state.fit === 'width'
      ? (size.width - 48) / base.width
      : state.fit === 'page'
        ? Math.min((size.width - 48) / base.width, (size.height - 40) / base.height)
        : state.scale;

  const annotations = useAnnotations(session, services, scroller, infos, scale, state.rotation, setNotice);
  const selectedAnnotation = state.annotations.find((a) => a.id === state.selectedId);
  const [regionAsk, setRegionAsk] = useState(false);
  const [flash, setFlash] = useState<{ page: number; quads: Quad[] }>();
  const [textVersion, setTextVersion] = useState(0);
  const [ocrProgress, setOcrProgress] = useState(session.text?.store.getState());

  useEffect(() => session.text?.store.subscribe((next) => setOcrProgress(next)), [session]);
  useEffect(
    () =>
      session.text?.store.subscribe((next, old) => {
        if (next.version !== old.version) {
          setTextVersion(next.version);
          const selected = selectionRef.current;
          if (
            selected &&
            Object.keys(selected.revisions).some((p) => next.pages[Number(p)] !== old.pages[Number(p)])
          ) {
            stopDrag(true);
          }
        }
      }),
    [session, stopDrag]
  );

  const layout = useMemo(() => {
    let top = 20;
    return Array.from({ length: document.pageCount }, (_, i) => {
      const pageInfo = infos[i + 1] ?? infos[1] ?? estimate;
      const v = viewport(pageInfo, scale, state.rotation);
      const item = { top, height: v.height, width: v.width };
      top += v.height + 20;
      return item;
    });
  }, [document, infos, scale, state.rotation]);

  const firstVisible = Math.max(0, layout.findIndex((l) => l.top + l.height >= scroll));
  const lastVisible = Math.max(
    firstVisible,
    layout.findIndex((l) => l.top > scroll + size.height) === -1
      ? layout.length - 1
      : layout.findIndex((l) => l.top > scroll + size.height) - 1
  );
  const start = Math.max(0, firstVisible - 2);
  const end = Math.min(document.pageCount - 1, lastVisible + 2);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i + 1);

  useEffect(() => {
    const element = scroller.current!;
    const resize = () => setSize({ width: element.clientWidth, height: element.clientHeight, dpr: devicePixelRatio });
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    window.addEventListener('resize', resize);
    const timer = setInterval(() => {
      if (devicePixelRatio !== size.dpr) resize();
    }, 500);
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      clearInterval(timer);
    };
  }, [size.dpr]);

  useEffect(() => {
    const abort = new AbortController();
    life.current = abort;
    return () => {
      abort.abort();
      search.cancel();
    };
  }, [search]);

  useEffect(() => {
    let active = true;
    void document
      .getOutline()
      .then((v) => {
        if (active) setOutline(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [document]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const order = [
        ...pages,
        ...Array.from({ length: document.pageCount }, (_, i) => i + 1).filter((p) => !pages.includes(p)),
      ];
      for (const p of order) {
        if (!active) return;
        if (infos[p]) continue;
        const pageInfo = await document.getPageInfo(p);
        if (active) setInfos((old) => ({ ...old, [p]: pageInfo }));
        if (p % 10 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    })().catch(() => {
      if (active) setNotice('部分页面尺寸加载失败');
    });
    return () => {
      active = false;
    };
  }, [document]);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let page = state.page;
    let ratio = state.anchorRatio;
    if (!initial.current && layoutRef.current.length) {
      const old = layoutRef.current;
      const index = Math.max(0, old.findIndex((l) => l.top + l.height >= element.scrollTop));
      page = index + 1;
      ratio = (element.scrollTop - old[index].top) / old[index].height;
    }
    const target = layout[Math.min(page - 1, layout.length - 1)];
    restoring.current = true;
    element.scrollTop = Math.max(0, target.top + ratio * target.height);
    setScroll(element.scrollTop);
    layoutRef.current = layout;
    initial.current = false;
    const frame = requestAnimationFrame(() => {
      restoring.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [layout, size.width, size.height, size.dpr]);

  const getText = useCallback(
    async (page: number, signal: AbortSignal) => {
      if (session.text) return session.text.getPage(page, signal);
      const key = session.handle.docId + ':' + page;
      let result = textCache.get(key);
      if (!result) {
        result = await services.text.getPage(session.handle.docId, page, signal);
        signal.throwIfAborted();
        textCache.set(key, result, JSON.stringify(result).length * 2);
      }
      return result;
    },
    [session, services, textVersion]
  );

  useEffect(() => {
    const abort = new AbortController();
    if (!services.capabilities.nativeText) return;
    setTexts((old) => Object.fromEntries(Object.entries(old).filter(([page]) => pages.includes(Number(page)))));
    const timer = setTimeout(() => {
      void (async () => {
        for (const page of pages) {
          try {
            const value = await getText(page, abort.signal);
            if (!abort.signal.aborted) setTexts((old) => ({ ...old, [page]: value }));
          } catch {
            if (abort.signal.aborted) return;
          }
        }
      })();
    }, 120);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [start, end, getText, services.capabilities.nativeText]);

  useEffect(() => {
    if (!session.text || state.closeState !== 'open') return;
    const timer = setTimeout(() => {
      for (let page = firstVisible + 1; page <= lastVisible + 1; page++) {
        const phase = session.text!.store.getState().pages[page]?.phase;
        if (!phase || phase === 'pending') void session.text!.recognize(page, 1).catch(() => {});
      }
    }, 160);
    return () => clearTimeout(timer);
  }, [firstVisible, lastVisible, textVersion, session, state.closeState]);

  useEffect(() => {
    if (!query.trim() || !find) {
      search.cancel();
      setHits([]);
      setCounts([]);
      setCurrentHit(undefined);
      setCoverage({ searched: 0, unavailable: 0 });
      return;
    }
    search.run(query, document.pageCount, getText, (_hits, searched, unavailable, _queryId, nextCounts) => {
      setCounts(nextCounts);
      setCoverage({ searched, unavailable });
    });
    return () => search.cancel();
  }, [query, find, document, getText, search]);

  const jump = useCallback(
    (page: number) => {
      if (!Number.isInteger(page) || page < 1 || page > document.pageCount) {
        setNotice(`请输入 1–${document.pageCount} 之间的整数页码`);
        return;
      }
      const element = scroller.current;
      if (element) {
        element.scrollTop = layout[page - 1].top;
        setScroll(element.scrollTop);
        session.store.setState({ page, anchorRatio: 0 });
      }
    },
    [document, layout, session]
  );

  useEffect(() => {
    const chat = session.chat;
    if (!chat) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: AbortController | undefined;
    const off = chat.store.subscribe((next, old) => {
      const nav = next.navigation;
      if (!nav || nav === old.navigation) return;
      abort?.abort();
      abort = new AbortController();
      const signal = abort.signal;
      jump(nav.page);
      setFlash(undefined);
      if (nav.annotationId) session.store.setState({ selectedId: nav.annotationId });
      void (async () => {
        if (nav.quote) {
          const text = await getText(nav.page, signal);
          signal.throwIfAborted();
          if (nav.textRevision && nav.textRevision !== text.textRevision) {
            setNotice('文字已重新识别，原文位置未确认');
            return;
          }
          const ranges = verifiedCitationRanges(text, { ...nav, quote: nav.quote });
          if (!ranges) {
            setNotice('原文位置未确认（引文不存在或有多处匹配）');
            return;
          }
          setFlash({ page: nav.page, quads: rangeQuads(text, ranges) });
        } else if (nav.rect) {
          const [a, b, c, d] = nav.rect;
          setFlash({ page: nav.page, quads: [[a, b, c, b, c, d, a, d]] });
        }
        clearTimeout(timer);
        timer = setTimeout(() => setFlash(undefined), 1800);
      })().catch((e) => {
        if (!signal.aborted) setNotice(String(e));
      });
    });
    return () => {
      off();
      abort?.abort();
      clearTimeout(timer);
    };
  }, [session, getText, jump]);

  const moveMatch = useCallback(
    (delta: number) => {
      if (!totalMatches) return;
      setMatch((old) => (old + delta + totalMatches) % totalMatches);
    },
    [totalMatches]
  );

  useEffect(() => {
    if (!totalMatches) {
      setHits([]);
      setCurrentHit(undefined);
      return;
    }
    const abort = new AbortController();
    let offset = match;
    let page = 1;
    for (; page <= counts.length; page++) {
      if (offset < counts[page - 1]) break;
      offset -= counts[page - 1];
    }
    void getText(page, abort.signal)
      .then((text) => {
        if (abort.signal.aborted) return;
        const matches = searchPage(text, query);
        setHits(matches);
        const hit = matches[offset];
        setCurrentHit(hit);
        const key = query + ':' + page + ':' + offset;
        if (hit && lastMatchJump.current !== key) {
          lastMatchJump.current = key;
          jump(page);
          const q = hit.quads[0];
          const pageInfo = infos[page];
          if (q && pageInfo && scroller.current) {
            const [, y] = point(viewport(pageInfo, scale, state.rotation).transform, [
              (q[0] + q[2] + q[4] + q[6]) / 4,
              (q[1] + q[3] + q[5] + q[7]) / 4,
            ]);
            scroller.current.scrollTop = Math.max(0, layout[page - 1].top + y - size.height * 0.3);
          }
        }
      })
      .catch(() => {});
    return () => abort.abort();
  }, [match, totalMatches, query, getText]);

  useEffect(() => {
    setMatch(0);
  }, [query]);

  const copy = useCallback(async () => {
    const current = selectionRef.current;
    if (!current) return;
    const values: string[] = [];
    let bytes = 0;
    for (
      let page = Math.min(current.anchor.page, current.focus.page);
      page <= Math.max(current.anchor.page, current.focus.page);
      page++
    ) {
      const text = await getText(page, life.current.signal);
      const range = selectedRange(current, text);
      if (text.quality === 'unavailable' || !range) {
        setNotice('选区文字已变化或含有不可靠页面，请重新选择');
        return;
      }
      const value = copyText([{ page: text, range }]);
      bytes += new TextEncoder().encode(value).length + (values.length ? 1 : 0);
      if (bytes > 1024 * 1024) {
        setNotice('选中文字超过 1 MiB，请缩小选区');
        return;
      }
      values.push(value);
    }
    const value = values.join('\n');
    if (value) await services.clipboard.write(session.handle.docId, value);
  }, [getText, services, session]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const input = editingTarget(e.target);
      if (e.defaultPrevented || e.isComposing || state.editor || modalOpen()) return;
      if (!input && (e.ctrlKey || e.metaKey) && ['=', '+', '-', '0', '1', '2'].includes(e.key)) {
        e.preventDefault();
        session.store.setState(
          e.key === '1'
            ? { fit: 'width' }
            : e.key === '2'
              ? { fit: 'page' }
              : { fit: 'manual', scale: e.key === '0' ? 1 : Math.max(0.1, Math.min(5, scale * (e.key === '-' ? 0.8 : 1.25))) }
        );
        return;
      }
      if (!input && ['PageUp', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        jump(Math.max(1, Math.min(document.pageCount, state.page + (e.key === 'PageUp' ? -1 : 1))));
        return;
      }
      if (!input && annotations.editable && (e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        void (e.key.toLowerCase() === 'y' || e.shiftKey ? session.redo() : session.undo()).catch(annotations.fail);
        return;
      }
      if (
        !input &&
        annotations.editable &&
        e.key === 'Delete' &&
        state.selectedId &&
        scroller.current?.contains(window.document.activeElement)
      ) {
        e.preventDefault();
        void session.remove(state.selectedId).catch(annotations.fail);
        return;
      }
      if (!input && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFind(true);
      } else if (e.key === 'F3' || (find && e.key === 'Enter' && input)) {
        e.preventDefault();
        moveMatch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        setRegionAsk(false);
        setFind(false);
        stopDrag(true);
        annotations.cancel();
        session.store.setState({ selectedId: undefined });
      } else if (!input && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectionRef.current) {
        e.preventDefault();
        void copy().catch(() => setNotice('复制失败，请重试'));
      }
    };
    const blur = () => {
      if (drag.current) stopDrag(true);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', blur);
    };
  }, [find, moveMatch, copy, stopDrag, state.selectedId, state.editor, state.page, scale, jump, annotations.editable]);

  const hit = useCallback(
    (x: number, y: number): TextPosition | undefined => {
      const element = scroller.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      const position = y - bounds.top + element.scrollTop;
      let index = layout.findIndex((l) => position <= l.top + l.height);
      if (index < 0) index = layout.length - 1;
      const page = index + 1;
      const text = texts[page];
      const pageInfo = infos[page];
      if (!text || text.quality === 'unavailable' || !pageInfo) return;
      const box = element.querySelector(`[data-page="${page}"]`)?.getBoundingClientRect();
      if (!box) return;
      return { page, offset: hitIndexes.get(page)!.hit(clientToPage(pageInfo, scale, state.rotation, box, x, y)) };
    },
    [layout, texts, infos, scale, state.rotation, hitIndexes]
  );

  const extend = useCallback(
    (x: number, y: number) => {
      const position = hit(x, y);
      if (position) {
        setSelection((old) =>
          old
            ? {
                ...old,
                focus: position,
                revisions: { ...old.revisions, [position.page]: texts[position.page].textRevision },
              }
            : old
        );
      }
    },
    [hit, texts]
  );

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const d = drag.current;
      const element = scroller.current;
      if (d && element) {
        const b = element.getBoundingClientRect();
        const delta =
          d.y < b.top + 45
            ? -Math.min(24, (b.top + 45 - d.y) / 2)
            : d.y > b.bottom - 45
              ? Math.min(24, (d.y - b.bottom + 45) / 2)
              : 0;
        if (delta) {
          element.scrollTop += delta;
          extend(d.x, d.y);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [extend]);

  const visibleMatches = useMemo(
    () => Object.fromEntries(Object.values(texts).map((text) => [text.page, find && query ? searchPage(text, query) : []])),
    [texts, find, query]
  );

  const copyPosition = useMemo(() => {
    if (!selection) return { top: 16, right: 20 };
    const page = selection.focus.page;
    const text = texts[page];
    const pageInfo = infos[page];
    const item = layout[page - 1];
    if (!text || !pageInfo || !item) return { top: 16, right: 20 };
    const span = text.spans.find((s) => selection.focus.offset > s.range.start && selection.focus.offset <= s.range.end);
    const glyph = text.glyphs.find((g) => span?.glyphIds.includes(g.id));
    if (!glyph) return { top: 16, right: 20 };
    const [x, y] = point(viewport(pageInfo, scale, state.rotation).transform, [
      (glyph.quad[0] + glyph.quad[4]) / 2,
      (glyph.quad[1] + glyph.quad[5]) / 2,
    ]);
    const pageLeft = Math.max(20, (size.width - item.width) / 2);
    const left = Math.max(16, Math.min(size.width - 230, pageLeft + x - 90));
    const top = item.top + y - scroll;
    return { top: Math.max(8, Math.min(size.height - 54, top > 64 ? top - 52 : top + 28)), left };
  }, [selection, texts, infos, layout, scale, state.rotation, scroll, size.height, size.width]);

  const paint = (page: number, type: 'selection' | 'matches' | 'current'): Quad[] => {
    const text = texts[page];
    if (type === 'selection') {
      const range = text && selection && selectedRange(selection, text);
      return range ? rangeQuads(text, [range]) : [];
    }
    if (type === 'current') return currentHit?.page === page ? currentHit.quads : [];
    return (visibleMatches[page] ?? hits.filter((h) => h.page === page))
      .filter((h) => !currentHit || h.page !== currentHit.page || h.ranges[0].start !== currentHit.ranges[0].start)
      .flatMap((h) => h.quads);
  };

  const tab = {
    id: session.handle.docId,
    docHash: session.handle.docHash,
    title: session.handle.fileName,
    kind: session.handle.kind,
    pageCount: document.pageCount,
    currentPage: state.page,
    scale,
    rotation: state.rotation,
    textSource: texts[state.page]?.source ?? ('native' as const),
    ocrStatus: ocrProgress
      ? {
          isRecognizing:
            ocrProgress.all ||
            Object.values(ocrProgress.pages).some((p) => p.phase === 'running' || p.phase === 'queued'),
          currentPage: ocrProgress.all
            ? ocrProgress.completed
            : Object.values(ocrProgress.pages).filter((p) => p.phase === 'ready' || p.phase === 'empty').length,
          totalPage: document.pageCount,
          unrecognizedPages:
            document.pageCount -
            Object.values(ocrProgress.pages).filter((p) => p.phase === 'ready' || p.phase === 'empty').length,
        }
      : undefined,
  };

  const effectiveTool: ToolType = regionAsk ? 'regionAsk' : state.tool;

  const handleSelectTool = (tool: ToolType) => {
    if (tool === 'regionAsk') {
      setRegionAsk((v) => !v);
      stopDrag(true);
      return;
    }
    setRegionAsk(false);
    annotations.setTool(tool as Tool);
  };

  return (
    <main
      className="flex-1 min-h-0 flex flex-col relative bg-[#e6e8ec]"
      data-reader="true"
      data-doc-hash={session.handle.docHash}
      data-page-count={document.pageCount}
      data-current-page={state.page}
      data-text-pages={Object.keys(texts).join(',')}
    >
      <VersionNotice session={session} services={services} document={document} getText={getText} />

      <Toolbar
        currentTool={effectiveTool}
        onSelectTool={handleSelectTool}
        currentColor={annotations.style.color}
        onSelectColor={(color) => annotations.setStyle({ color })}
        strokeWidth={annotations.style.strokeWidth}
        onStrokeWidthChange={(strokeWidth) => annotations.setStyle({ strokeWidth })}
        opacity={annotations.style.opacity}
        onOpacityChange={(opacity) => annotations.setStyle({ opacity })}
        scale={scale}
        onScaleChange={(nextScale) => session.store.setState({ scale: nextScale, fit: 'manual' })}
        rotation={state.rotation}
        onRotate={() => session.store.setState({ rotation: (state.rotation + 90) % 360 })}
        onToggleSearch={() => setFind((v) => !v)}
        isSearchOpen={find}
        canUndo={annotations.editable && state.undoCount > 0}
        canRedo={annotations.editable && state.redoCount > 0}
        onUndo={() => void session.undo().catch(annotations.fail)}
        onRedo={() => void session.redo().catch(annotations.fail)}
        onFitWidth={() => session.store.setState({ fit: 'width' })}
        onFitPage={() => session.store.setState({ fit: 'page' })}
        fitMode={state.fit}
        toolsDisabled={!annotations.editable}
        showRegionAsk={!!session.chat}
      />

      {session.text && (
        <OcrControls
          controller={session.text}
          page={state.page}
          count={document.pageCount}
          disabled={state.closeState !== 'open'}
          kind={session.handle.kind}
        />
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <ToolRail
          activePanel={panel}
          onTogglePanel={(next) => choosePanel(panel === next ? 'none' : next)}
          onSelectPointer={() => {
            setRegionAsk(false);
            annotations.setTool('select');
            choosePanel('none');
          }}
          isPointerActive={effectiveTool === 'select'}
          annotationCount={state.annotations.length}
        />

        {panel === 'annotations' && (
          <AnnotationPanel
            documentAnnotations={state.annotations}
            pageCount={document.pageCount}
            selectedAnnotationId={state.selectedId}
            onSelectAnnotation={(id, page) => {
              annotations.select(id);
              if (page <= document.pageCount) jump(page);
            }}
            onDeleteAnnotation={(id, e) => {
              e.stopPropagation();
              if (annotations.editable) void session.remove(id).catch(annotations.fail);
            }}
            onClose={() => choosePanel('none')}
          />
        )}

        {panel === 'thumbnails' && (
          <ThumbnailPanel
            document={document}
            pageCount={document.pageCount}
            currentPage={state.page}
            onSelectPage={jump}
            onClose={() => choosePanel('none')}
          />
        )}

        {panel === 'outline' && (
          <OutlinePanel
            outline={outline}
            currentPage={state.page}
            onSelectPage={jump}
            onClose={() => choosePanel('none')}
          />
        )}

        {/* Center Document Canvas */}
        <div className="flex-1 min-w-0 relative canvas-backdrop">
          {/* Floating Toasts inside Reader Viewport */}
          {(state.access === 'readOnly' || state.saveState === 'error' || notice) && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 max-w-[calc(100%-32px)] pointer-events-none">
              {state.access === 'readOnly' && (
                <ToastBanner tone="warning" className="pointer-events-auto">
                  只读模式 · 此文档正在被其他窗口编辑
                </ToastBanner>
              )}
              {state.saveState === 'error' && (
                <ToastBanner
                  tone="error"
                  role="alert"
                  className="pointer-events-auto"
                  action={
                    <button
                      type="button"
                      className="px-2.5 py-0.5 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium"
                      onClick={() => void session.retry().catch(annotations.fail)}
                    >
                      重试保存
                    </button>
                  }
                >
                  保存失败，修改仍保留：{state.error}
                </ToastBanner>
              )}
              {notice && (
                <ToastBanner tone="warning" role="alert" className="pointer-events-auto" onClose={() => setNotice('')}>
                  {notice}
                </ToastBanner>
              )}
            </div>
          )}

          <div
            ref={scroller}
            tabIndex={0}
            data-testid="reader-scroll"
            className="absolute inset-0 overflow-auto canvas-backdrop outline-none"
            style={{ touchAction: 'none', userSelect: 'none' }}
            onScroll={(e) => {
              const top = e.currentTarget.scrollTop;
              setScroll(top);
              if (!restoring.current) {
                const index = Math.max(0, layout.findIndex((l) => l.top + l.height >= top));
                session.store.setState({
                  page: index + 1,
                  anchorRatio: (top - layout[index].top) / layout[index].height,
                });
              }
            }}
            onPointerDown={(e) => {
              e.currentTarget.focus({ preventScroll: true });
              if (annotations.down(e)) {
                e.preventDefault();
                stopDrag(true);
                return;
              }
              if ((state.tool !== 'select' && state.tool !== 'highlight' && state.tool !== 'underline') || state.editor) {
                return;
              }
              if (e.button !== 0) return;
              const pos = hit(e.clientX, e.clientY);
              if (!pos) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY };
              const text = texts[pos.page];
              const previous = clicks.current;
              const now = performance.now();
              const count =
                now - previous.time < 450 && Math.hypot(e.clientX - previous.x, e.clientY - previous.y) < 5
                  ? (previous.count % 3) + 1
                  : 1;
              clicks.current = { time: now, x: e.clientX, y: e.clientY, count };
              const range =
                count >= 3
                  ? text.lines.find((l) => pos.offset >= l.range.start && pos.offset <= l.range.end)?.range
                  : count === 2
                    ? wordRange(text.text, pos.offset)
                    : undefined;
              setSelection({
                anchor: { page: pos.page, offset: range?.start ?? pos.offset },
                focus: { page: pos.page, offset: range?.end ?? pos.offset },
                revisions: { [pos.page]: text.textRevision },
              });
            }}
            onPointerMove={(e) => {
              if (annotations.move(e)) return;
              if (drag.current?.pointer !== e.pointerId) return;
              drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY };
              extend(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              if (annotations.up(e)) return;
              if (drag.current?.pointer === e.pointerId) {
                stopDrag();
                setSelection((old) => (old ? { ...old } : old));
                if (state.tool === 'highlight' || state.tool === 'underline') {
                  void annotations
                    .annotate(selectionRef.current, getText, state.tool)
                    .then(() => setSelection(undefined))
                    .catch(annotations.fail);
                }
              }
            }}
            onPointerCancel={() => {
              stopDrag(true);
              annotations.cancel();
            }}
          >
            <div
              style={{
                position: 'relative',
                height: layout.at(-1)!.top + Math.max(layout.at(-1)!.height + 20, size.height),
                minWidth: Math.max(size.width, ...layout.map((l) => l.width + 40)),
              }}
            >
              {pages.map((page) => {
                const item = layout[page - 1];
                const pageInfo = infos[page];
                const values = state.annotations.filter((a) => a.page === page && a.id !== annotations.preview?.id);
                if (annotations.preview?.page === page) {
                  const original = annotations.gesture.current?.original;
                  if (original) {
                    const i = values.findIndex((a) => a.id === original.id);
                    if (i >= 0) values.splice(i, 1);
                  }
                  values.push(annotations.preview);
                }
                return (
                  <div
                    key={page}
                    style={{
                      position: 'absolute',
                      top: item.top,
                      left: Math.max(20, (size.width - item.width) / 2),
                      width: item.width,
                      height: item.height,
                    }}
                  >
                    {pageInfo && (
                      <PageView
                        document={document}
                        info={pageInfo}
                        scale={scale}
                        rotation={state.rotation}
                        dpr={size.dpr}
                        priority={page >= firstVisible + 1 && page <= lastVisible + 1 ? 0 : 10 + Math.abs(page - state.page)}
                        selection={paint(page, 'selection')}
                        matches={paint(page, 'matches')}
                        current={flash?.page === page ? flash.quads : paint(page, 'current')}
                        onRecover={recover}
                        annotations={values}
                        selectedId={state.selectedId}
                      />
                    )}
                    {regionAsk && pageInfo && session.chat && (
                      <RegionSelection
                        info={pageInfo}
                        scale={scale}
                        rotation={state.rotation}
                        chat={session.chat}
                        onCancel={() => setRegionAsk(false)}
                      />
                    )}
                    {session.text && <OcrPageStatus controller={session.text} page={page} />}
                  </div>
                );
              })}
            </div>
          </div>

          <FindBar
            isOpen={find}
            onClose={() => setFind(false)}
            currentMatchIndex={totalMatches ? match + 1 : 0}
            totalMatches={totalMatches}
            onNextMatch={() => moveMatch(1)}
            onPrevMatch={() => moveMatch(-1)}
            searchTerm={query}
            onSearchTermChange={setQuery}
            coverage={
              find
                ? {
                    searched: coverage.searched,
                    total: document.pageCount,
                    unavailable: coverage.unavailable,
                  }
                : undefined
            }
            unrecognizedPages={tab.ocrStatus?.unrecognizedPages}
            onRecognizeAll={session.text ? () => void session.text!.all(document.pageCount) : undefined}
          />

          {selectedAnnotation && annotations.editable && (
            <AnnotationInspector
              annotation={selectedAnnotation}
              session={session}
              fail={annotations.fail}
              onEdit={() => annotations.edit(selectedAnnotation)}
              onReanchor={() => {
                annotations.setTool(selectedAnnotation.type === 'underline' ? 'underline' : 'highlight');
                annotations.reanchor.current = selectedAnnotation.id;
                setSelection(undefined);
                setNotice('请重新拖选文字，完成后会替换原标注组');
              }}
              onShowSource={
                selectedAnnotation.llmRef && session.chat
                  ? () =>
                      session.chat!.source(
                        selectedAnnotation.llmRef!.conversationId,
                        selectedAnnotation.llmRef!.messageId
                      )
                  : undefined
              }
            />
          )}

          {/* Selection Floating Bar */}
          {selection && !drag.current && (
            <div
              style={copyPosition}
              className="animate-surface-in absolute z-40 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] px-1.5 py-1 flex items-center space-x-1 select-none"
            >
              {annotations.editable && (
                <>
                  <button
                    type="button"
                    aria-label="高亮选中文字"
                    title="高亮选中文字"
                    onClick={() =>
                      void annotations
                        .annotate(selection, getText, 'highlight')
                        .then(() => setSelection(undefined))
                        .catch(annotations.fail)
                    }
                    className="p-1.5 rounded-lg text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329] transition-colors"
                  >
                    <Highlighter className="w-3.5 h-3.5 text-amber-500" />
                    <span className="sr-only">高亮选中文字</span>
                  </button>
                  <button
                    type="button"
                    aria-label="下划线选中文字"
                    title="下划线选中文字"
                    onClick={() =>
                      void annotations
                        .annotate(selection, getText, 'underline')
                        .then(() => setSelection(undefined))
                        .catch(annotations.fail)
                    }
                    className="p-1.5 rounded-lg text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329] transition-colors"
                  >
                    <UnderlineIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span className="sr-only">下划线选中文字</span>
                  </button>
                </>
              )}
              <button
                type="button"
                aria-label="复制选中文字"
                title="复制选中文字"
                onClick={() => void copy().catch(() => setNotice('复制失败，请重试'))}
                className="p-1.5 rounded-lg text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329] transition-colors"
              >
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                <span className="sr-only">复制选中文字</span>
              </button>
              {session.chat && (
                <>
                  <div className="w-[1px] h-3.5 bg-slate-200 mx-0.5" />
                  <button
                    type="button"
                    onClick={() =>
                      void (async () => {
                        for (
                          let p = Math.min(selection.anchor.page, selection.focus.page);
                          p <= Math.max(selection.anchor.page, selection.focus.page);
                          p++
                        ) {
                          const t = await getText(p, life.current.signal);
                          const range = selectedRange(selection, t);
                          if (!range || t.quality === 'unavailable') {
                            throw Error('选区已失效，请重新选择');
                          }
                          session.chat!.addQuote({
                            type: 'citation',
                            page: p,
                            quote: t.text.slice(range.start, range.end),
                            textRevision: t.textRevision,
                            ranges: [range],
                            confirmed: true,
                          });
                        }
                        setSelection(undefined);
                      })().catch(annotations.fail)
                    }
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100/80 text-blue-600 text-[12px] font-medium transition-colors"
                    title="把选中文字作为引用发送给 AI"
                  >
                    <Sparkles className="w-3 h-3 text-blue-600" />
                    <span>问 AI</span>
                  </button>
                </>
              )}
            </div>
          )}

          {state.editor && <AnnotationEditor key={state.editor.annotation.id} session={session} fail={annotations.fail} />}
        </div>

        {/* Right AI Chat Panel or Compact Floating AI Pill */}
        {session.chat && (
          <>
            {!chatCollapsed ? (
              <div className={narrow ? 'absolute right-0 top-0 bottom-0 z-40 flex bg-white shadow-2xl' : 'flex min-h-0'}>
                <Splitter
                  onMouseDown={startSplit}
                  onDoubleClick={() => {
                    const width = Math.max(340, Math.min(640, window.innerWidth * 0.35));
                    setChatWidth(width);
                    void savePreference({ chatWidth: width });
                  }}
                  isDragging={splitting}
                />
                <LiveChatPanel chat={session.chat} width={chatWidth} onCollapse={() => setChatCollapsed(true)} />
              </div>
            ) : (
              <button
                type="button"
                aria-label="展开对话"
                onClick={() => setChatCollapsed(false)}
                className="animate-surface-in group absolute bottom-4 right-5 z-30 inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-[0_10px_28px_-6px_rgba(15,23,42,0.18)] hover:shadow-[0_14px_32px_-6px_rgba(37,99,235,0.28)] hover:border-blue-300 transition-all cursor-pointer select-none active:scale-95"
                title="展开对话面板"
              >
                <div className="relative w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-[0_4px_12px_-2px_rgba(37,99,235,0.45)] flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white" />
                </div>
                <span className="text-[12.5px] font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">
                  AI 助手
                </span>
                <ChevronLeft className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 group-hover:-translate-x-0.5 transition-all" />
              </button>
            )}
          </>
        )}
      </div>

      <StatusBar
        activeTab={tab}
        onPageChange={jump}
        scale={scale}
        onScaleChange={(nextScale) => session.store.setState({ scale: nextScale, fit: 'manual' })}
        isSaved={!state.editor && state.saveState === 'saved'}
        saveState={state.saveState === 'error' ? 'error' : state.editor ? 'pending' : state.saveState}
        onCancelOcr={() => session.text?.cancel()}
      />
    </main>
  );
}
