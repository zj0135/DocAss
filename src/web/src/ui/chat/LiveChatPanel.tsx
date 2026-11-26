import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  History,
  RotateCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { Message, Content } from '../../contracts';
import type { ChatSession } from '../../llm/ChatSession';
import { ancestorChain } from '../../llm/context';
import { parseCitations } from '../../llm/citations';
import { AttachmentPreview } from './AttachmentPreview';
import { ToolRecord } from './ToolRecord';
import { CitationChip } from './CitationChip';
import { SafeMarkdown } from './SafeMarkdown';
import { CustomSelect } from '../primitives/CustomSelect';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { ToastBanner } from '../primitives/ToastBanner';

const toolLabels: Record<string, string> = {
  get_document_info: '读取文档信息',
  get_page_text: '读取页面文字',
  search_document: '搜索文档',
  get_page_image: '查看页面图像',
  get_region_image: '查看区域图像',
  list_annotations: '读取标注',
  create_annotation: '创建标注',
};

export function LiveChatPanel({
  chat,
  width = 380,
  onCollapse,
}: {
  chat: ChatSession;
  width?: number;
  onCollapse?: () => void;
}) {
  const state = useStore(chat.store);
  const doc = useStore(chat.access.session.store);
  const list = useRef<HTMLDivElement>(null);
  const sticky = useRef(true);
  const [limit, setLimit] = useState(50);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState('');
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setMenu(false);
      }
    };
    const outside = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !menuButton.current?.contains(e.target as Node)) {
        setMenu(false);
      }
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', outside);
    };
  }, [menu]);

  const conversation = state.conversations.find((c) => c.id === state.activeId);
  const messages = conversation ? ancestorChain(state.messages, conversation.headId) : [];
  const branches = chat.branches();
  const fail = (e: unknown) => chat.store.setState({ error: String(e) });

  useEffect(() => {
    void chat.refreshProviders().catch(fail);
  }, [chat]);

  useEffect(() => {
    if (sticky.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [state.messages, state.activeId]);

  useEffect(() => {
    setLimit(50);
    sticky.current = true;
  }, [state.activeId]);

  useEffect(() => {
    if (state.focusMessage) {
      setLimit(Number.MAX_SAFE_INTEGER);
      requestAnimationFrame(() =>
        list.current?.querySelector(`[data-message="${state.focusMessage}"]`)?.scrollIntoView({ block: 'center' })
      );
    }
  }, [state.focusMessage]);

  const slash = conversation?.modelRef.indexOf('/') ?? -1;
  const p = state.providers.find((item) => item.id === conversation?.modelRef.slice(0, slash));
  const model = p?.models.find((m) => m.modelId === conversation?.modelRef.slice(slash + 1));
  const vision = !!p?.imageAllowed && !!model?.input.includes('image');
  const send = () => void chat.send().catch(fail);
  const busy = state.phase !== 'idle';
  const canSend =
    doc.access === 'edit' &&
    chat.access.services.capabilities.llm &&
    (!!state.draft.trim() || state.attachments.length > 0 || state.quotes.length > 0);

  const modelOptions = [
    ...(conversation && !model && conversation.modelRef
      ? [{ value: conversation.modelRef, label: '配置已删除' }]
      : []),
    ...state.providers.flatMap((provider) =>
      provider.models.map((m) => ({
        value: `${provider.id}/${m.modelId}`,
        label: `${provider.name} / ${m.modelId}`,
      }))
    ),
  ];

  return (
    <aside
      aria-label="文档对话"
      data-testid="live-chat"
      style={{ width, maxWidth: 'calc(100vw - 48px)' }}
      className="shrink-0 border-l border-[#e3e6ea] bg-white flex flex-col min-h-0 select-none relative z-10"
    >
      {/* Header (48px) */}
      <header className="h-[48px] shrink-0 border-b border-[#e3e6ea] flex items-center justify-between px-3.5 gap-2 relative bg-white/95 backdrop-blur-xs">
        <button
          ref={menuButton}
          type="button"
          className="flex items-center space-x-1.5 text-[14px] font-semibold text-[#1f2329] hover:bg-slate-100/80 px-2 py-1 rounded-xl transition-colors min-w-0 max-w-[200px]"
          onClick={() => {
            setMenu(!menu);
            setRename(conversation?.title ?? '');
          }}
        >
          <span className="truncate">{conversation?.title ?? '文档对话'}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform duration-150 ${
              menu ? 'rotate-180 text-blue-600' : ''
            }`}
          />
        </button>

        <div className="flex items-center space-x-1 flex-shrink-0">
          <button
            type="button"
            disabled={busy || doc.access !== 'edit'}
            onClick={() => void chat.create().catch(fail)}
            className="flex items-center px-2.5 py-1 rounded-xl border border-[#e3e6ea] text-[12px] font-medium text-blue-600 hover:bg-blue-50/80 hover:border-blue-200 transition-all shadow-2xs disabled:opacity-40 active:scale-95"
            title="新建对话"
          >
            <span>＋新建</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMenu(!menu);
              setRename(conversation?.title ?? '');
            }}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              menu ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-100'
            }`}
            title="对话历史"
            aria-label="对话历史"
          >
            <History className="w-4 h-4" />
          </button>

          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="收起对话面板"
              aria-label="收起对话"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Session Menu Popover */}
        {menu && (
          <div
            ref={menuRef}
            className="animate-surface-in absolute top-12 left-3 right-3 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-[0_16px_36px_-10px_rgba(15,23,42,0.18)] p-3.5 z-50 space-y-3 text-xs"
          >
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                切换会话
              </div>
              <CustomSelect
                ariaLabel="选择会话"
                size="sm"
                className="w-full"
                placeholder="选择会话"
                value={state.activeId}
                onChange={(v) => {
                  chat.select(v);
                  setMenu(false);
                }}
                options={[
                  { value: '', label: '选择会话' },
                  ...state.conversations.map((c) => ({ value: c.id, label: c.title })),
                ]}
              />
            </div>

            {conversation && (
              <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                <input
                  aria-label="会话标题"
                  className="settings-input text-[12.5px] mt-0"
                  placeholder="输入会话标题…"
                  value={rename}
                  onChange={(e) => setRename(e.target.value)}
                />
                <div className="flex items-center justify-between pt-0.5">
                  <button
                    type="button"
                    onClick={() => void chat.rename(rename).then(() => setMenu(false)).catch(fail)}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors"
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      setConfirmDeleteSession(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>删除会话</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {branches.length > 1 && (
        <div className="px-3.5 py-1.5 border-b border-[#e3e6ea] bg-slate-50/70 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">回答分支</span>
          <CustomSelect
            ariaLabel="回答分支"
            size="xs"
            align="right"
            value={conversation?.headId ?? ''}
            onChange={(v) => void chat.branch(v).catch(fail)}
            options={branches.map((m, i) => ({
              value: m.id,
              label: `分支 ${i + 1} · ${m.createdAt.slice(11, 19)}`,
            }))}
          />
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={list}
        data-testid="chat-messages"
        className="flex-1 min-h-0 overflow-auto p-4 space-y-4 bg-slate-50/50"
        onScroll={(e) => {
          const el = e.currentTarget;
          sticky.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {!messages.length && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3.5">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-[14.5px] font-bold text-slate-800 tracking-tight">AI 文档分析助手</h3>
              <p className="text-[12.5px] text-slate-500 mt-1.5 max-w-[260px] leading-relaxed">
                针对当前文档提问。可选中文字“问 AI”，或框选图表后添加附件。
              </p>
            </div>
          </div>
        )}

        {(messages.length >= limit || messages[0]?.parentId) && (
          <button
            type="button"
            className="w-full py-1.5 text-blue-600 hover:bg-blue-50 rounded-xl text-xs font-medium transition-colors"
            onClick={() => void chat.loadMore().then(() => setLimit(limit + 50)).catch(fail)}
          >
            加载更早消息
          </button>
        )}

        {messages.slice(-limit).map((m) => (
          <LiveMessage
            key={m.id}
            message={m}
            chat={chat}
            regenerate={() => {
              const chain = ancestorChain(state.messages, m.id);
              const user = chain.findLast((v) => v.role === 'user');
              if (user) void chat.send(user.id).catch(fail);
            }}
            busy={busy}
          />
        ))}
      </div>

      {/* Inline Floating Feedback Toasts */}
      {(state.error || state.notice) && (
        <div className="px-3 pt-2 space-y-1.5 bg-white border-t border-slate-100">
          {state.error && (
            <ToastBanner
              tone="error"
              role="alert"
              onClose={() => chat.store.setState({ error: undefined })}
            >
              {state.error}
            </ToastBanner>
          )}
          {state.notice && (
            <ToastBanner tone="warning" role="status">
              {state.notice}
            </ToastBanner>
          )}
        </div>
      )}

      {!chat.access.services.capabilities.llm && (
        <p className="px-3.5 py-1.5 text-[11.5px] text-slate-500 bg-slate-50/80 border-t border-[#e3e6ea]">
          真实模型请求需要桌面应用。
        </p>
      )}

      {/* Composer */}
      <div className="p-3 bg-white border-t border-[#e3e6ea] shrink-0">
        <div className="bg-[#f5f6f8] border border-[#e3e6ea] rounded-2xl p-2.5 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-3 focus-within:ring-blue-500/12 transition-all">
          {(state.quotes.length > 0 || state.attachments.length > 0) && (
            <div className="space-y-1.5 mb-2 pb-2 border-b border-slate-200/80">
              {state.quotes.map((q, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-blue-50 border border-blue-200/70 px-2.5 py-1 text-xs flex items-center gap-2 text-blue-800"
                >
                  <button type="button" onClick={() => chat.jump(q)} className="truncate flex-1 text-left">
                    p{q.page} · {q.quote}
                  </button>
                  <button
                    type="button"
                    aria-label={`移除引用 ${i + 1}`}
                    onClick={() => chat.store.setState({ quotes: state.quotes.filter((_, n) => i !== n) })}
                    className="p-0.5 rounded-full hover:bg-blue-200/60 text-blue-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {state.attachments.length > 0 && (
                <div className="flex gap-2 overflow-auto">
                  {state.attachments.map((a) => (
                    <div
                      key={a.attachmentId}
                      className="relative w-32 shrink-0 text-[11px] bg-white border border-[#e3e6ea] rounded-xl p-1.5 shadow-2xs"
                    >
                      <button
                        type="button"
                        onClick={() => chat.jump({ page: a.page!, rect: a.rect })}
                        className="block w-full overflow-hidden rounded-lg"
                      >
                        <AttachmentPreview
                          services={chat.access.services}
                          docId={chat.access.session.handle.docId}
                          attachmentId={a.attachmentId}
                        />
                      </button>
                      <div className="flex items-center justify-between mt-1 text-slate-600">
                        <span className="truncate font-medium">第 {a.page} 页 · 框选区域</span>
                        <button
                          type="button"
                          aria-label="移除附件"
                          className="p-0.5 rounded-full hover:bg-slate-100 text-slate-500"
                          onClick={() =>
                            chat.store.setState({
                              attachments: state.attachments.filter((v) => v.attachmentId !== a.attachmentId),
                            })
                          }
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      {!vision && (
                        <p className="text-amber-700 mt-0.5">
                          {a.text ? '仅发送区域文字' : '无可读文字，需视觉模型'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <textarea
            aria-label="文档问题"
            placeholder="针对当前文档提问..."
            value={state.draft}
            disabled={doc.access !== 'edit'}
            rows={2}
            className="w-full bg-transparent text-[13px] text-[#1f2329] placeholder:text-slate-400 focus:outline-hidden resize-none leading-relaxed select-text"
            onChange={(e) => chat.store.setState({ draft: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />

          <div className="flex items-center justify-between gap-2 pt-1.5 mt-1">
            <CustomSelect
              ariaLabel="对话模型"
              size="xs"
              direction="up"
              placeholder="选择模型"
              value={conversation?.modelRef ?? ''}
              onFocus={() => void chat.refreshProviders().catch(fail)}
              onChange={(v) => void chat.model(v).catch(fail)}
              options={[{ value: '', label: '选择模型' }, ...modelOptions]}
              className="max-w-[210px] min-w-[120px]"
              triggerClassName="bg-transparent border-transparent hover:bg-slate-200/60 shadow-none"
              icon={<Sparkles className="w-3.5 h-3.5 text-blue-600" />}
            />

            {busy ? (
              <button
                type="button"
                onClick={() => chat.stop()}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[12.5px] font-medium shadow-xs transition-all active:scale-95 flex-shrink-0"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>{state.phase === 'queued' ? '取消排队' : state.phase === 'stopping' ? '正在停止' : '停止'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!canSend}
                onClick={send}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium transition-all flex-shrink-0 ${
                  canSend
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-[0_4px_12px_-2px_rgba(37,99,235,0.4)] cursor-pointer active:scale-95'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
                title="发送提问 (Ctrl+Enter)"
              >
                <Send className="w-3.5 h-3.5" />
                <span>发送</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Custom Confirm Dialog for Deleting Session */}
      <ConfirmDialog
        open={confirmDeleteSession}
        title="删除当前对话"
        message="确定删除此会话记录？文档中已创建的标注将会保留。"
        confirmLabel="删除会话"
        onCancel={() => setConfirmDeleteSession(false)}
        onConfirm={() => {
          setConfirmDeleteSession(false);
          void chat.remove().catch(fail);
        }}
      />
    </aside>
  );
}

function LiveMessage({
  message: m,
  chat,
  regenerate,
  busy,
}: {
  message: Message;
  chat: ChatSession;
  regenerate: () => void;
  busy: boolean;
}) {
  const progress = useStore(chat.store, (s) => s.tools);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const fail = (e: unknown) => chat.store.setState({ error: String(e) });
  const text = m.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const calls = m.content.filter((b) => b.type === 'toolCall');
  const results = m.content.filter((b) => b.type === 'toolResult');
  const attachments = m.content.filter((b) => b.type === 'attachment');
  const citations = m.content.filter((b) => b.type === 'citation');
  const errors = m.content.filter((b) => b.type === 'error');

  const render = (value: string) => {
    const parts: React.ReactNode[] = [];
    let end = 0;
    for (const item of parseCitations(value)) {
      parts.push(value.slice(end, item.start));
      const saved = m.content.find(
        (b): b is Extract<Content, { type: 'citation' }> =>
          b.type === 'citation' &&
          b.page === item.citation.page &&
          b.quote === item.citation.quote &&
          b.anchorToken === item.citation.anchorToken
      );
      parts.push(
        <CitationChip
          key={item.start}
          page={item.citation.page}
          label={item.citation.quote}
          onClick={() =>
            chat.jump({
              ...item.citation,
              textRevision: saved?.textRevision,
              confirmed: saved?.confirmed === true,
              ranges: saved?.confirmed ? saved.ranges : undefined,
            })
          }
        />
      );
      end = item.end;
    }
    parts.push(value.slice(end));
    return parts;
  };

  if (m.role === 'user') {
    return (
      <article data-message={m.id} className="animate-float-in flex flex-col items-end space-y-2 select-text">
        {attachments.map((a) => (
          <div
            key={a.attachmentId}
            className="max-w-[280px] bg-white border border-[#e3e6ea] rounded-xl shadow-xs overflow-hidden p-1.5"
          >
            <button
              type="button"
              className="block max-w-full"
              onClick={() => chat.jump({ page: a.page!, rect: a.rect })}
            >
              <AttachmentPreview
                services={chat.access.services}
                docId={chat.access.session.handle.docId}
                attachmentId={a.attachmentId}
              />
            </button>
            {a.page && (
              <div className="px-2 pt-1 text-[11.5px] font-medium text-slate-600">
                第 {a.page} 页 · 框选区域
              </div>
            )}
          </div>
        ))}

        {citations.map((b, i) => (
          <button
            key={i}
            type="button"
            className="max-w-[85%] text-left text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100 transition-colors"
            onClick={() => chat.jump(b)}
          >
            p{b.page} · {b.quote.slice(0, 100)}
          </button>
        ))}

        {text && (
          <div className="max-w-[85%] bg-gradient-to-br from-blue-600 to-blue-700 text-white px-3.5 py-2.5 rounded-2xl rounded-tr-xs text-[13.5px] leading-relaxed shadow-[0_6px_16px_-4px_rgba(37,99,235,0.35)]">
            <SafeMarkdown text={text} renderText={render} />
          </div>
        )}
      </article>
    );
  }

  if (m.role === 'tool') {
    return (
      <article data-message={m.id} className="animate-float-in flex space-x-3 text-left select-text pl-10">
        <div className="flex-1 space-y-1.5 max-w-full">
          {attachments.map((a) => (
            <div
              key={a.attachmentId}
              className="max-w-[280px] bg-white border border-[#e3e6ea] rounded-xl shadow-xs overflow-hidden p-1.5"
            >
              <button
                type="button"
                className="block max-w-full"
                onClick={() => chat.jump({ page: a.page!, rect: a.rect })}
              >
                <AttachmentPreview
                  services={chat.access.services}
                  docId={chat.access.session.handle.docId}
                  attachmentId={a.attachmentId}
                />
              </button>
            </div>
          ))}

          {results.map((r) => (
            <div
              key={r.toolCallId}
              className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-[12px] text-slate-600 space-y-2 shadow-2xs"
            >
              <details>
                <summary className="cursor-pointer font-medium text-slate-700">
                  {toolLabels[text] ?? '文档操作'} · {m.state === 'failed' ? '执行失败' : '已完成'}
                </summary>
                <pre className="whitespace-pre-wrap max-h-36 overflow-auto mt-2 p-2 rounded-lg bg-white border border-slate-200/70 text-[11px] font-mono">
                  {r.resultJson}
                </pre>
              </details>
              {!!r.annotationIds?.length && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-emerald-50/80 border border-emerald-200/80 rounded-lg text-[12px] text-emerald-700">
                  <div className="flex items-center flex-wrap gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span className="font-medium">已为你创建 {r.annotationIds.length} 处标注</span>
                    {r.annotationIds.map((id) => {
                      const a = chat.access.session.store.getState().annotations.find((v) => v.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className="text-blue-600 hover:underline font-medium"
                          onClick={() =>
                            a
                              ? chat.jump({ page: a.page, annotationId: a.id, rect: a.rect })
                              : chat.store.setState({ notice: '关联标注已删除，工具记录仍保留' })
                          }
                        >
                          {a ? '跳转标注' : '标注已删除'}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
                    onClick={() => void chat.undo(r.annotationIds!).catch(fail)}
                  >
                    撤销这组标注
                  </button>
                </div>
              )}
            </div>
          ))}

          {errors.map((b, i) => (
            <ToastBanner key={i} tone="error" role="alert">
              {b.message}
            </ToastBanner>
          ))}
        </div>
      </article>
    );
  }

  return (
    <article data-message={m.id} className="animate-float-in flex space-x-3 text-left select-text">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-[0_4px_12px_-2px_rgba(37,99,235,0.4)]">
        <Bot className="w-4 h-4" />
      </div>

      <div className="flex-1 space-y-2.5 max-w-[calc(100%-40px)] min-w-0">
        {calls.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            {expanded ? '收起' : `已调用 ${calls.length} 项工具`}
          </button>
        )}

        {(calls.length <= 3 || expanded) && calls.length > 0 && (
          <div className="space-y-1.5">
            {calls.map((c) => (
              <ToolRecord
                key={c.toolCallId}
                tool={{
                  id: c.toolCallId,
                  text: toolLabels[c.name] ?? '文档操作',
                  icon: c.name.includes('search') ? 'search' : c.name.includes('image') ? 'image' : 'document',
                  status: progress[c.wireId ?? c.toolCallId] ? 'pending' : 'completed',
                }}
              />
            ))}
          </div>
        )}

        <div className="bg-white border border-[#e3e6ea] rounded-2xl rounded-tl-xs p-3.5 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.04)] text-[13px] text-slate-800 space-y-3">
          {m.state !== 'completed' && (
            <div className="text-[11px] text-slate-400">
              {m.state === 'running'
                ? '正在生成…'
                : m.state === 'interrupted'
                  ? '上次生成已中断'
                  : m.state === 'cancelled'
                    ? '已停止'
                    : '生成失败'}
            </div>
          )}

          {text && (
            <div className="leading-relaxed">
              <SafeMarkdown text={text} renderText={render} />
              {m.state === 'running' && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-blue-600 animate-pulse align-middle rounded-full" />
              )}
            </div>
          )}

          {errors.map((b, i) => (
            <ToastBanner key={i} tone="error" role="alert">
              {b.message}
            </ToastBanner>
          ))}

          {m.state !== 'running' && (
            <div className="flex items-center space-x-3 pt-2 border-t border-slate-100 text-[11.5px] text-slate-400">
              <button
                type="button"
                onClick={() =>
                  void chat.access.services.clipboard
                    .write(chat.access.session.handle.docId, text)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1800);
                    })
                    .catch(fail)
                }
                className="flex items-center space-x-1 hover:text-slate-700 transition-colors"
                title="复制回答"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-600">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>复制</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={regenerate}
                className="flex items-center space-x-1 hover:text-slate-700 transition-colors disabled:opacity-40"
                title="重新生成回答"
              >
                <RotateCw className="w-3 h-3" />
                <span>{m.state === 'failed' ? '重试' : '重新生成'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
