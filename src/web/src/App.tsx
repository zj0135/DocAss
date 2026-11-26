import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useStore } from 'zustand';
import { FileText, FolderOpen, Settings, Clock, Sparkles, Lock, AlertTriangle } from 'lucide-react';
import { createServices } from './services';
import { appStore, DocSession } from './state/appStore';
import { TitleBar } from './ui/TitleBar';
import { FoundationSettingsDialog } from './ui/settings/FoundationSettingsDialog';
import { AttachmentPreview } from './ui/chat/AttachmentPreview';
import { ToastBanner } from './ui/primitives/ToastBanner';
import type { AppServices } from './services/AppServices';
import type { DocTab } from './types';
import { buildStamp } from './buildStamp';
import { DocumentPool } from './documents/DocumentPool';
import { DocumentReader } from './documents/DocumentReader';
import { DocumentText } from './ocr/DocumentText';
import { ChatSession } from './llm/ChatSession';
import { resourceSnapshot } from './documents/resources';
import { editingTarget, modalOpen } from './ui/keyboard';
import type { OpenResult, RecentDocument } from './documents/types';

export default function App() {
  return <Workspace />;
}

function Workspace() {
  const services = useMemo(createServices, []);
  const sessions = useMemo(() => new Map<string, DocSession>(), []);
  const pool = useMemo(() => new DocumentPool(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const openAbort = useRef<AbortController | null>(null);
  const closeBusy = useRef(false);
  const windowClosing = useRef(false);
  const queuedWindowClose = useRef<string | undefined>(undefined);
  const [closePrompt, setClosePrompt] = useState<{
    ids: string[];
    requestId?: string;
    error: string;
  }>();
  const [closingText, setClosingText] = useState('');
  const [opening, setOpening] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [recent, setRecent] = useState<RecentDocument[]>([]);
  const [passwordRequest, setPasswordRequest] = useState<{
    incorrect: boolean;
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  }>();
  const [password, setPassword] = useState('');
  const prompt = useCallback(
    (incorrect: boolean) =>
      new Promise<string>((resolve, reject) => {
        setPassword('');
        setPasswordRequest({ incorrect, resolve, reject });
      }),
    [],
  );
  const state = useStore(appStore);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [fixturesEnabled, setFixturesEnabled] = useState(!services.capabilities.desktop);

  useEffect(() => {
    if (
      !fixturesEnabled ||
      (!services.capabilities.desktop &&
        new URLSearchParams(location.search).get('fixture') !== '1')
    ) {
      return;
    }
    Object.defineProperty(window, '__docassResources', {
      configurable: true,
      get: () => ({ ...resourceSnapshot(), activeDocuments: pool.activeCount }),
    });
    return () => {
      Reflect.deleteProperty(window, '__docassResources');
    };
  }, [pool, fixturesEnabled]);

  const report = (error: unknown) =>
    appStore.setState({ error: error instanceof Error ? error.message : String(error) });

  useEffect(() => {
    let active = true;
    void services
      .bootstrap()
      .then(data => {
        if (active) {
          appStore.setState({ settings: data.settings, ready: true });
          setMaximized(data.window.maximized);
          setFixturesEnabled(!services.capabilities.desktop || data.fixturesEnabled === true);
          void services.documents.recent().then(setRecent).catch(report);
        }
      })
      .catch(report);
    const unsubscribe = services.window.subscribe(setMaximized);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [services]);

  const adopt = useCallback(
    async (initial: OpenResult, signal: AbortSignal) => {
      if (windowClosing.current) {
        if (initial.status !== 'ready') await services.documents.cancelOpen(initial.openId);
        else if (!sessions.has(initial.handle!.docId))
          await services.documents.close(initial.handle!.docId);
        return;
      }
      let result = initial;
      try {
        while (result.status !== 'ready') {
          const pw = await prompt(result.status === 'incorrect');
          signal.throwIfAborted();
          result = await services.documents.unlock(result.openId, pw, signal);
        }
        const handle = result.handle!;
        if (sessions.has(handle.docId)) {
          appStore.setState({ activeDocId: handle.docId });
          return;
        }
        pool.register(handle.docId, () => services.documents.source(handle.docId));
        try {
          const lease = await pool.acquire(handle.docId, prompt, signal);
          const count = lease.document.pageCount;
          lease.release();
          signal.throwIfAborted();
          await services.documents.loaded(handle.docId, count);
          const session = new DocSession(handle, services);
          session.migrationFrom = result.previousHash;
          await session.restore();
          signal.throwIfAborted();
          if (windowClosing.current) throw new DOMException('已取消', 'AbortError');
          session.store.setState({ pageCount: count });
          sessions.set(handle.docId, session);
          if (services.capabilities.ocr)
            session.text = new DocumentText(handle, services, pool, prompt);
          session.chat = new ChatSession({ session, services, pool, prompt });
          await session.chat.load();
          appStore.setState(s => ({
            tabs: [...s.tabs, handle],
            activeDocId: handle.docId,
            error: undefined,
          }));
          setRecent(await services.documents.recent());
        } catch (e) {
          await pool.close(handle.docId);
          await services.documents.close(handle.docId);
          throw e;
        }
      } catch (e) {
        if (result.status !== 'ready') await services.documents.cancelOpen(result.openId);
        throw e;
      }
    },
    [services, pool, sessions, prompt],
  );

  const open = async (file?: File, hash?: string) => {
    if (openAbort.current || closeBusy.current || windowClosing.current) return;
    const abort = new AbortController();
    openAbort.current = abort;
    setOpening(true);
    try {
      const result = hash
        ? await services.documents.openRecent(hash, abort.signal)
        : await services.documents.open(file, abort.signal);
      if (result) await adopt(result, abort.signal);
    } catch (e) {
      if (!abort.signal.aborted && !(e instanceof DOMException && e.name === 'AbortError'))
        report(e);
    } finally {
      setOpening(false);
      openAbort.current = null;
    }
  };

  useEffect(() => {
    let queue = Promise.resolve();
    return services.documents.subscribe(
      result => {
        queue = queue.then(async () => {
          const abort = new AbortController();
          openAbort.current = abort;
          setOpening(true);
          try {
            await adopt(result, abort.signal);
          } catch (e) {
            if (!abort.signal.aborted && !(e instanceof DOMException && e.name === 'AbortError'))
              report(e);
          } finally {
            openAbort.current = null;
            setOpening(false);
          }
        });
      },
      message => report(new Error(message)),
    );
  }, [services, adopt]);

  const choose = () => {
    if (windowClosing.current) return;
    if (services.capabilities.desktop) void open();
    else fileInput.current?.click();
  };

  const openFixture = async (name: 'report' | 'contract') => {
    if (closeBusy.current || windowClosing.current) return;
    try {
      const handle = await services.documents.openFixture(name);
      let session = sessions.get(handle.docId);
      if (handle.byteLength > 0) {
        await adopt(
          {
            status: 'ready',
            openId: handle.docId,
            fileName: handle.fileName,
            handle,
            pageCount: 1,
          },
          new AbortController().signal,
        );
        return;
      }
      if (windowClosing.current) {
        if (!session) await services.documents.close(handle.docId);
        return;
      }
      if (!session) {
        session = new DocSession(handle, services);
        await session.restore();
        if (windowClosing.current) {
          await services.documents.close(handle.docId);
          return;
        }
        sessions.set(handle.docId, session);
      }
      appStore.setState(current => ({
        tabs: current.tabs.some(t => t.docId === handle.docId)
          ? current.tabs
          : [...current.tabs, handle],
        activeDocId: handle.docId,
        error: undefined,
      }));
    } catch (e) {
      report(e);
    }
  };

  const finishClose = async (ids: string[], requestId?: string) => {
    if (requestId) {
      windowClosing.current = true;
      openAbort.current?.abort();
      passwordRequest?.reject(new DOMException('已取消', 'AbortError'));
      setPassword('');
      setPasswordRequest(undefined);
      for (const s of sessions.values()) {
        s.stop();
      }
    }
    if (closeBusy.current) {
      if (requestId) queuedWindowClose.current = requestId;
      return;
    }
    closeBusy.current = true;
    setClosingText('正在保存并关闭…');
    for (const id of ids) sessions.get(id)?.stop();
    try {
      for (const id of ids) await sessions.get(id)?.prepareClose();
      if (requestId) {
        await services.window.closeReady(requestId, true);
      } else {
        for (const id of ids) {
          await sessions.get(id)?.close();
          await pool.close(id);
          sessions.delete(id);
          appStore.setState(s => ({
            tabs: s.tabs.filter(t => t.docId !== id),
            activeDocId:
              s.activeDocId === id
                ? (s.tabs.find(t => t.docId !== id)?.docId ?? '')
                : s.activeDocId,
          }));
        }
      }
      setClosePrompt(undefined);
    } catch (e) {
      setClosePrompt({ ids, requestId, error: e instanceof Error ? e.message : String(e) });
    } finally {
      closeBusy.current = false;
      setClosingText('');
      const next = queuedWindowClose.current;
      queuedWindowClose.current = undefined;
      if (next) void finishClose([...sessions.keys()], next);
    }
  };

  const closeTab = (id: string) => void finishClose([id]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || modalOpen() || editingTarget(e.target)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'o') {
        e.preventDefault();
        choose();
      } else if (k === 'w' && state.activeDocId) {
        e.preventDefault();
        closeTab(state.activeDocId);
      } else if (k === 'tab' && state.tabs.length) {
        e.preventDefault();
        const index = state.tabs.findIndex(t => t.docId === state.activeDocId);
        appStore.setState({
          activeDocId:
            state.tabs[(index + (e.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length]
              .docId,
        });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [state.activeDocId, state.tabs, settingsOpen, opening]);

  useEffect(
    () => services.window.onClosing(requestId => void finishClose([...sessions.keys()], requestId)),
    [services, sessions, pool, passwordRequest],
  );

  useEffect(
    () =>
      services.window.onCloseCancelled(() => {
        windowClosing.current = false;
        queuedWindowClose.current = undefined;
        for (const session of sessions.values()) session.cancelClose();
        setClosePrompt(undefined);
        setClosingText('');
      }),
    [services, sessions],
  );

  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (
        [...sessions.values()].some(
          s => s.store.getState().saveState !== 'saved' || s.store.getState().editor,
        )
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [sessions]);

  const tabs: DocTab[] = state.tabs.map(h => ({
    id: h.docId,
    docHash: h.docHash,
    title: h.fileName,
    kind: h.kind,
    pageCount: sessions.get(h.docId)?.store.getState().pageCount ?? 1,
    currentPage: 1,
    scale: 1,
    rotation: 0,
    textSource: 'native',
  }));
  const session = sessions.get(state.activeDocId);

  return (
    <div
      data-build-stamp={buildStamp}
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#f5f6f8] text-[#1f2329] relative"
      onDragOver={e => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
      }}
      onDrop={e => {
        e.preventDefault();
        setIsDragOver(false);
        if (windowClosing.current) return;
        const files = Array.from(e.dataTransfer.files);
        if (services.capabilities.desktop) services.documents.drop(files);
        else {
          void (async () => {
            for (const file of files) await open(file);
          })();
        }
      }}
    >
      <input
        ref={fileInput}
        data-testid="file-input"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.bmp"
        multiple
        hidden
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void (async () => {
            for (const file of files) await open(file);
          })();
        }}
      />

      <TitleBar
        tabs={tabs}
        activeTabId={state.activeDocId}
        onSelectTab={activeDocId => appStore.setState({ activeDocId })}
        onCloseTab={(id, e) => {
          e.stopPropagation();
          void closeTab(id);
        }}
        onAddTab={choose}
        onOpenSettings={() => setSettingsOpen(true)}
        isMaximized={maximized}
        windowEnabled={services.capabilities.window}
        onToggleMaximize={() => void services.window.maximize().catch(report)}
        onMinimize={() => void services.window.minimize().catch(report)}
        onRequestClose={() => void services.window.requestClose().catch(report)}
      />

      {/* Global Floating Toast Stack */}
      {(state.error || closingText || opening) && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[65] flex flex-col items-center gap-2 max-w-[min(560px,calc(100vw-32px))] pointer-events-none">
          {state.error && (
            <ToastBanner
              tone="warning"
              role="alert"
              className="pointer-events-auto"
              action={
                <button
                  type="button"
                  className="text-amber-800 hover:underline font-medium"
                  onClick={() => appStore.setState({ error: undefined })}
                >
                  关闭提示
                </button>
              }
            >
              {state.error}
            </ToastBanner>
          )}
          {closingText && (
            <ToastBanner tone="loading" role="status" className="pointer-events-auto">
              {closingText}
            </ToastBanner>
          )}
          {opening && (
            <ToastBanner
              tone="loading"
              role="status"
              className="pointer-events-auto"
              action={
                <button
                  type="button"
                  className="text-blue-600 hover:underline font-medium"
                  onClick={() => {
                    openAbort.current?.abort();
                    passwordRequest?.reject(new DOMException('已取消', 'AbortError'));
                    setPassword('');
                    setPasswordRequest(undefined);
                  }}
                >
                  取消打开
                </button>
              }
            >
              正在打开文件…
            </ToastBanner>
          )}
        </div>
      )}

      {closePrompt && (
        <div className="fixed inset-0 z-[70] bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-label="关闭前保存"
            className="animate-surface-in bg-white border border-slate-200/90 rounded-2xl p-6 max-w-lg w-full shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22)]"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] text-[#1f2329]">
                  尚未关闭：{closePrompt.error}
                </p>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                  修改仍保留在当前窗口中。可取消关闭继续编辑，或重试保存。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2.5 text-sm pt-5 mt-4 border-t border-slate-100">
              <button
                type="button"
                className="px-3.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors"
                onClick={() => {
                  closePrompt.ids.forEach(id => sessions.get(id)?.cancelClose());
                  if (closePrompt.requestId)
                    void services.window.closeReady(closePrompt.requestId, false);
                  setClosePrompt(undefined);
                }}
              >
                取消关闭
              </button>
              <button
                type="button"
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors"
                onClick={() =>
                  void (async () => {
                    try {
                      for (const id of closePrompt.ids) {
                        const s = sessions.get(id);
                        s?.cancelClose();
                        if (s?.store.getState().saveState === 'error') await s.retry();
                      }
                      await finishClose(closePrompt.ids, closePrompt.requestId);
                    } catch (e) {
                      setClosePrompt({ ...closePrompt, error: String(e) });
                    }
                  })()
                }
              >
                重试保存并关闭
              </button>
              <button
                type="button"
                className="px-3.5 py-1.5 rounded-xl text-red-700 hover:bg-red-50 font-medium transition-colors"
                onClick={() =>
                  void (async () => {
                    try {
                      for (const id of closePrompt.ids) {
                        const s = sessions.get(id);
                        await s?.discard();
                        s?.cancelClose();
                      }
                      await finishClose(closePrompt.ids, closePrompt.requestId);
                    } catch (e) {
                      setClosePrompt({ ...closePrompt, error: String(e) });
                    }
                  })()
                }
              >
                放弃未保存修改并关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {session ? (
        session.handle.byteLength === 0 ? (
          <SessionView key={session.handle.docId} session={session} services={services} />
        ) : (
          <DocumentReader
            key={session.handle.docId}
            session={session}
            services={services}
            pool={pool}
            prompt={prompt}
          />
        )
      ) : (
        <main className="flex-1 min-h-0 canvas-backdrop relative flex flex-col items-center justify-center p-6 overflow-auto select-none">
          {/* Ambient radial highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute w-[540px] h-[340px] rounded-full bg-blue-400/10 blur-3xl"
          />

          <div
            className={`animate-surface-in relative max-w-lg w-full bg-white/95 backdrop-blur-md rounded-3xl shadow-[0_20px_50px_-14px_rgba(15,23,42,0.12)] border p-9 text-center space-y-6 transition-all duration-200 ${
              isDragOver
                ? 'border-blue-500 ring-4 ring-blue-500/15 scale-[1.01]'
                : 'border-slate-200/90'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-[0_12px_24px_-6px_rgba(37,99,235,0.45)]">
              <FileText className="w-8 h-8" />
            </div>

            <div>
              <h1 className="text-[22px] font-bold text-[#1f2329] tracking-tight">
                欢迎使用 DocAss
              </h1>
              <p className="text-[13.5px] text-slate-500 mt-1.5">工作区中还没有文档</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium text-[13.5px] shadow-[0_8px_20px_-6px_rgba(37,99,235,0.45)] transition-all active:scale-95"
                onClick={choose}
              >
                <FolderOpen className="w-4 h-4" />
                <span>打开文档</span>
              </button>
              <button
                type="button"
                className="inline-flex items-center space-x-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-[#1f2329] px-4 py-2.5 rounded-xl text-[13.5px] font-medium transition-all active:scale-95 shadow-2xs"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="w-4 h-4 text-slate-500" />
                <span>应用设置</span>
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-center gap-1.5">
                {['PDF', 'PNG', 'JPEG', 'BMP'].map(ext => (
                  <span
                    key={ext}
                    className="px-2 py-0.5 rounded-md bg-slate-100/90 text-[10.5px] font-mono font-medium text-slate-500"
                  >
                    {ext}
                  </span>
                ))}
              </div>
              <p className="text-[12px] text-slate-400">
                支持 PDF、PNG、JPEG、BMP；也可将文件拖到窗口中
              </p>
            </div>

            {recent.length > 0 && (
              <div className="pt-5 border-t border-slate-100 text-left">
                <h2 className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-400 mb-2.5 uppercase tracking-widest">
                  <Clock className="w-3.5 h-3.5" />
                  <span>最近打开</span>
                </h2>
                <div className="max-h-48 overflow-auto space-y-1">
                  {recent.map(item => (
                    <button
                      key={item.docHash}
                      type="button"
                      className="group w-full text-left text-[13px] py-2 px-3 rounded-xl text-slate-700 hover:bg-blue-50/70 hover:text-blue-700 flex items-center justify-between transition-colors"
                      onClick={() => void open(undefined, item.docHash)}
                    >
                      <span className="flex items-center space-x-2.5 truncate">
                        <FileText className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors" />
                        <span className="truncate font-medium">{item.fileName}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {fixturesEnabled && (
        <div className="flex gap-4 justify-center py-2 px-4 bg-[#f5f6f8] border-t border-[#e3e6ea] text-xs text-slate-600 shrink-0">
          <span className="text-slate-400">文档示例</span>
          <button
            type="button"
            className="hover:text-blue-600 font-medium transition-colors"
            onClick={() => void openFixture('report')}
          >
            打开报告示例
          </button>
          <button
            type="button"
            className="hover:text-blue-600 font-medium transition-colors"
            onClick={() => void openFixture('contract')}
          >
            打开合同示例
          </button>
        </div>
      )}

      {(!session || new URLSearchParams(location.search).get('fixture') === '1') && (
        <footer className="h-[28px] bg-white border-t border-[#e3e6ea] px-4 flex items-center text-[12px] text-slate-500 shrink-0">
          {state.ready
            ? services.capabilities.desktop
              ? '桌面模式'
              : new URLSearchParams(location.search).get('fixture') === '1'
                ? '浏览器固定样本 · OCR 与模型回复为合成验收数据'
                : '浏览器模式 · 文件与修改保存在此浏览器中'
            : '正在连接…'}
        </footer>
      )}

      {settingsOpen && (
        <FoundationSettingsDialog
          services={services}
          initial={state.settings}
          onSaved={settings => appStore.setState({ settings })}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {passwordRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            role="dialog"
            aria-label="PDF 密码"
            className="animate-surface-in bg-white border border-slate-200/90 rounded-2xl shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22)] p-6 w-96"
            onSubmit={e => {
              e.preventDefault();
              passwordRequest.resolve(password);
              setPassword('');
              setPasswordRequest(undefined);
            }}
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
              <h2 className="text-[15px] font-bold text-[#1f2329]">输入 PDF 密码</h2>
            </div>
            {passwordRequest.incorrect && (
              <ToastBanner tone="error" role="alert" className="mb-3 py-1.5 px-3">
                密码错误，请重试
              </ToastBanner>
            )}
            <input
              autoFocus
              type="password"
              autoComplete="off"
              aria-label="文档密码"
              className="settings-input w-full"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <div className="flex justify-end gap-2.5 mt-4 text-sm">
              <button
                type="button"
                className="px-3.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                onClick={() => {
                  passwordRequest.reject(new DOMException('已取消', 'AbortError'));
                  setPassword('');
                  setPasswordRequest(undefined);
                }}
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors"
              >
                解锁
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SessionView({ session, services }: { session: DocSession; services: AppServices }) {
  const state = useStore(session.store);
  const saveDraft = async () => {
    const id = crypto.randomUUID();
    await session.commit({
      type: 'batch',
      mutations: [
        {
          type: 'conversation.put',
          value: {
            id,
            title: state.draft || '示例笔记',
            modelRef: 'fixture',
            createdAt: new Date().toISOString(),
          },
        },
      ],
    });
  };
  return (
    <main className="flex-1 min-h-0 flex canvas-backdrop" data-access={state.access}>
      {state.access === 'readOnly' && (
        <div className="p-4 bg-amber-50 border-r border-amber-200 text-amber-900 text-sm">
          <p role="status">此文档由其他窗口编辑，当前为只读。</p>
          <button
            type="button"
            className="mt-2 underline font-medium"
            onClick={() =>
              void session
                .reacquire()
                .catch(error => session.store.setState({ error: String(error) }))
            }
          >
            重新取得编辑权限
          </button>
        </div>
      )}
      <section className="flex-1 overflow-auto p-8">
        <article className="mx-auto bg-white shadow-sm border border-[#e3e6ea] rounded-xl max-w-2xl p-12 min-h-[500px]">
          <p className="text-sm text-blue-600 mb-5 font-medium">示例文档</p>
          <h1 className="text-2xl font-semibold text-[#1f2329]">{session.handle.fileName}</h1>
          <p className="mt-8 leading-8 text-slate-700">
            此示例用于体验文档切换、笔记保存和分段回复。每份文档拥有独立的状态；重新打开示例后，可以继续查看已保存的笔记。
          </p>
          <div className="mt-6 flex items-center gap-4 text-sm">
            <button
              type="button"
              className="px-3 py-1 rounded-lg border border-[#e3e6ea] hover:bg-slate-50"
              onClick={() => session.store.setState({ page: Math.max(1, state.page - 1) })}
            >
              上一页
            </button>
            <span data-testid="page" className="font-mono text-slate-600">
              第 {state.page} 页
            </span>
            <button
              type="button"
              className="px-3 py-1 rounded-lg border border-[#e3e6ea] hover:bg-slate-50"
              onClick={() => session.store.setState({ page: Math.min(12, state.page + 1) })}
            >
              下一页
            </button>
          </div>
        </article>
      </section>
      <aside className="w-[400px] max-w-[45vw] bg-white border-l border-[#e3e6ea] p-5 flex flex-col gap-4">
        <h2 className="font-semibold flex items-center gap-2 text-[#1f2329]">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span>示例对话</span>
        </h2>
        <textarea
          disabled={state.access !== 'edit'}
          aria-label="示例笔记"
          className="settings-input min-h-24"
          value={state.draft}
          onChange={e => session.store.setState({ draft: e.target.value })}
        />
        <button
          type="button"
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-40"
          disabled={state.access !== 'edit'}
          onClick={() => void saveDraft().catch(() => {})}
        >
          保存笔记
        </button>
        <p role="status" className="text-xs text-slate-500">
          {state.saveState === 'saved'
            ? '已保存'
            : state.saveState === 'saving'
              ? '保存中…'
              : '保存失败'}{' '}
          · 版本 {state.documentRevision}
        </p>
        {state.error && (
          <p role="alert" className="text-xs text-red-700">
            {state.error}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => void session.retry().catch(() => {})}
            >
              重试
            </button>
          </p>
        )}
        <ul className="text-sm space-y-2 overflow-auto">
          {state.conversations.map(c => (
            <li key={c.id} className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
              {c.title}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="border border-[#e3e6ea] hover:bg-slate-50 rounded-lg py-2 text-sm font-medium disabled:opacity-40"
          disabled={state.access !== 'edit'}
          onClick={() => (state.running ? session.stop() : void session.runFixture())}
        >
          {state.running ? '停止示例回复' : '生成示例回复'}
        </button>
        {state.messages.map(message => (
          <div key={message.id}>
            {message.content.map((block, index) =>
              block.type === 'attachment' ? (
                <AttachmentPreview
                  key={index}
                  services={services}
                  docId={session.handle.docId}
                  attachmentId={block.attachmentId}
                />
              ) : block.type === 'text' ? (
                <p key={index} className="text-sm">
                  {block.text}
                </p>
              ) : null,
            )}
          </div>
        ))}
        <p data-testid="fixture-reply" className="text-sm leading-7 text-slate-700">
          {state.reply}
        </p>
      </aside>
    </main>
  );
}
