import React, { useState, useRef } from 'react';
import type { ChatAttachment } from '../../types';
import { Send, Square, Sparkles, X, ChevronDown } from 'lucide-react';

interface ComposerProps {
  onSendMessage: (content: string, attachments?: ChatAttachment[]) => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
  attachments: ChatAttachment[];
  onRemoveAttachment: (id: string) => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  availableModels: string[];
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  isStreaming,
  onStopStreaming,
  attachments,
  onRemoveAttachment,
  selectedModel,
  onSelectModel,
  availableModels,
}) => {
  const [input, setInput] = useState('');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || isStreaming) return;
    onSendMessage(input.trim(), attachments);
    setInput('');
  };

  return (
    <div className="p-3 bg-white border-t border-[#e3e6ea] flex-shrink-0 select-none">
      <div className="bg-[#f5f6f8] border border-[#e3e6ea] rounded-2xl p-2.5 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all">
        {/* Attachment Tray (Image 3) */}
        {attachments.length > 0 && (
          <div className="flex items-center space-x-2 mb-2 pb-2 border-b border-slate-200">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative flex items-center space-x-2 bg-white border border-slate-200 rounded-lg p-1.5 shadow-2xs group"
              >
                {/* Mock thumbnail of cropped chart */}
                <div className="w-10 h-7 bg-blue-100 rounded flex items-center justify-center text-blue-600 text-[10px] font-mono">
                  📊
                </div>
                <span className="text-[11.5px] text-slate-700 font-medium pr-4">
                  {att.title}
                </span>
                <button
                  onClick={() => onRemoveAttachment(att.id)}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="针对当前文档提问..."
          rows={2}
          className="w-full bg-transparent text-[13px] text-[#1f2329] placeholder:text-slate-400 focus:outline-hidden resize-none leading-relaxed"
        />

        {/* Bottom Bar: Model Selector & Action Button */}
        <div className="flex items-center justify-between pt-1 mt-1">
          {/* Model Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              className="flex items-center space-x-1.5 px-2 py-1 rounded-lg text-[12px] font-medium text-slate-600 hover:bg-slate-200/60 hover:text-[#1f2329] transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>{selectedModel}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showModelMenu && (
              <div className="absolute bottom-8 left-0 w-44 bg-white border border-[#e3e6ea] rounded-xl shadow-lg py-1 z-50 text-[12.5px] animate-in fade-in duration-100">
                <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase">
                  切换模型
                </div>
                {availableModels.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      onSelectModel(m);
                      setShowModelMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between ${
                      selectedModel === m ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    <span>{m}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Send or Stop Button (Images 1, 3) */}
          {isStreaming ? (
            <button
              onClick={onStopStreaming}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[12.5px] font-medium shadow-xs transition-colors"
              title="停止生成"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>停止</span>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() && attachments.length === 0}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-[12.5px] font-medium transition-all ${
                input.trim() || attachments.length > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer'
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
  );
};
