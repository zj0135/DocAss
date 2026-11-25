import React, { useState } from 'react';
import type { ChatMessage } from '../../types';
import { ToolRecord } from './ToolRecord';
import { CitationChip } from './CitationChip';
import { Bot, Copy, RotateCw, Check } from 'lucide-react';

interface MessageItemProps {
  message: ChatMessage;
  showSystemAction?: boolean;
  onJumpToCitation: (page: number) => void;
  onUndoSystemAction?: () => void;
  onRegenerate?: () => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  showSystemAction = true,
  onJumpToCitation,
  onUndoSystemAction,
  onRegenerate,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // Strip citation syntax for clean clipboard text
    const cleanText = message.content.replace(/\[\[p\d+\|([^\]]+)\]\]/g, '$1');
    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Parse text content and replace [[p12|第 12 页]] with CitationChip
  const renderFormattedContent = (content: string) => {
    const parts = [];
    const regex = /\[\[p(\d+)\|([^\]]+)\]\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }
      const pageNum = parseInt(match[1], 10);
      const label = match[2];
      parts.push(
        <CitationChip
          key={`${pageNum}-${match.index}`}
          page={pageNum}
          label={label}
          onClick={onJumpToCitation}
        />
      );
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return (
      <div className="whitespace-pre-wrap leading-relaxed">
        {parts.map((p, idx) => (typeof p === 'string' ? <span key={idx}>{p}</span> : p))}
        {message.isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-1 bg-blue-600 animate-pulse align-middle" />
        )}
      </div>
    );
  };

  // Render User Message (Right-aligned blue bubble)
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end space-y-2 select-text">
        {/* Attachment Thumbnail Card (Image 3) */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="max-w-[280px] bg-white border border-[#e3e6ea] rounded-xl shadow-xs overflow-hidden">
            {/* Chart screenshot mockup */}
            <div className="h-28 bg-slate-50 p-2.5 flex flex-col justify-end border-b border-slate-100">
              <div className="flex items-end justify-around h-20 px-4">
                <div className="w-5 bg-blue-400 h-12 rounded-t-xs" />
                <div className="w-5 bg-blue-500 h-16 rounded-t-xs" />
                <div className="w-5 bg-blue-400 h-10 rounded-t-xs" />
                <div className="w-5 bg-blue-600 h-20 rounded-t-xs" />
              </div>
            </div>
            <div className="px-3 py-1.5 bg-slate-50/50 text-[11.5px] font-medium text-slate-600">
              {message.attachments[0].title}
            </div>
          </div>
        )}

        {/* User Message Bubble */}
        <div className="max-w-[85%] bg-blue-600 text-white px-3.5 py-2.5 rounded-2xl rounded-tr-xs text-[13.5px] leading-relaxed shadow-xs">
          {message.content}
        </div>
      </div>
    );
  }

  // Render Assistant Message (Left-aligned card with Bot avatar)
  return (
    <div className="flex space-x-3 text-left select-text">
      {/* Bot Avatar */}
      <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
        <Bot className="w-4 h-4" />
      </div>

      <div className="flex-1 space-y-2.5 max-w-[calc(100%-40px)]">
        {/* Tool Call Records (Design doc 10.7 & Prototype 1, 3, 4) */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {message.toolCalls.map((t) => (
              <ToolRecord key={t.id} tool={t} />
            ))}
          </div>
        )}

        {/* Message Body Card */}
        <div className="bg-white border border-[#e3e6ea] rounded-2xl rounded-tl-xs p-3.5 shadow-xs text-[13px] text-slate-800 space-y-3">
          {renderFormattedContent(message.content)}

          {/* System Action Feedback (Image 2: "✓ 已为你创建 2 处高亮 [撤销]") */}
          {showSystemAction && message.systemAction && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-green-50/80 border border-green-200/80 rounded-lg text-[12px] text-green-700 mt-2">
              <div className="flex items-center space-x-1.5">
                <Check className="w-3.5 h-3.5 text-green-600" />
                <span className="font-medium">{message.systemAction.text}</span>
              </div>
              <button
                onClick={onUndoSystemAction}
                className="text-blue-600 hover:text-blue-700 font-medium hover:underline ml-2"
              >
                {message.systemAction.actionLabel}
              </button>
            </div>
          )}

          {/* Message Action Footer: Copy & Regenerate */}
          {!message.isStreaming && (
            <div className="flex items-center space-x-3 pt-2 border-t border-slate-100 text-[11.5px] text-slate-400">
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 hover:text-slate-700 transition-colors"
                title="复制回答"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-green-600" />
                    <span className="text-green-600">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>复制</span>
                  </>
                )}
              </button>

              <button
                onClick={onRegenerate}
                className="flex items-center space-x-1 hover:text-slate-700 transition-colors"
                title="重新生成回答"
              >
                <RotateCw className="w-3 h-3" />
                <span>重新生成</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
