import { useState } from 'react';
import { useStore } from 'zustand';
import { Bot, Check, Copy, RotateCw } from 'lucide-react';
import type { Message, Content } from '../../contracts';
import type { ChatSession } from '../../llm/ChatSession';
import { parseCitations } from '../../llm/citations';
import { AttachmentPreview } from './AttachmentPreview';
import { ToolRecord } from './ToolRecord';
import { CitationChip } from './CitationChip';
import { SafeMarkdown } from './SafeMarkdown';
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

export function LiveMessage({
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
  const progress = useStore(chat.store, s => s.tools);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const fail = (e: unknown) => chat.store.setState({ error: String(e) });
  const text = m.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');
  const calls = m.content.filter(b => b.type === 'toolCall');
  const results = m.content.filter(b => b.type === 'toolResult');
  const attachments = m.content.filter(b => b.type === 'attachment');
  const citations = m.content.filter(b => b.type === 'citation');
  const errors = m.content.filter(b => b.type === 'error');

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
          b.anchorToken === item.citation.anchorToken,
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
        />,
      );
      end = item.end;
    }
    parts.push(value.slice(end));
    return parts;
  };

  if (m.role === 'user') {
    return (
      <article
        data-message={m.id}
        className="animate-float-in flex flex-col items-end space-y-2 select-text"
      >
        {attachments.map(a => (
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
      <article
        data-message={m.id}
        className="animate-float-in flex space-x-3 text-left select-text pl-10"
      >
        <div className="flex-1 space-y-1.5 max-w-full">
          {attachments.map(a => (
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

          {results.map(r => (
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
                    {r.annotationIds.map(id => {
                      const a = chat.access.session.store
                        .getState()
                        .annotations.find(v => v.id === id);
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
            {calls.map(c => (
              <ToolRecord
                key={c.toolCallId}
                tool={{
                  id: c.toolCallId,
                  text: toolLabels[c.name] ?? '文档操作',
                  icon: c.name.includes('search')
                    ? 'search'
                    : c.name.includes('image')
                      ? 'image'
                      : 'document',
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
