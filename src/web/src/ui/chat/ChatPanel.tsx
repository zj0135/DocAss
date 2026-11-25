import React, { useState, useRef, useEffect } from 'react';
import type { ChatSession, ChatAttachment } from '../../types';
import { MessageItem } from './MessageItem';
import { Composer } from './Composer';
import {
  Plus,
  History,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Sparkles,
  Trash2,
  Edit2,
  Check,
} from 'lucide-react';

interface ChatPanelProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onSendMessage: (content: string, attachments?: ChatAttachment[]) => void;
  isStreaming: boolean;
  onStopStreaming: () => void;
  attachments: ChatAttachment[];
  onRemoveAttachment: (id: string) => void;
  onJumpToCitation: (page: number) => void;
  onUndoSystemAction?: () => void;
  onRegenerate?: () => void;
  onCollapse: () => void;
  availableModels: string[];
  showSystemAction?: boolean;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onRenameSession,
  onSendMessage,
  isStreaming,
  onStopStreaming,
  attachments,
  onRemoveAttachment,
  onJumpToCitation,
  onUndoSystemAction,
  onRegenerate,
  onCollapse,
  availableModels,
  showSystemAction = true,
}) => {
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages]);

  const handleStartRename = (s: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(s.id);
    setEditTitle(s.title);
  };

  const handleSaveRename = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      onRenameSession(id, editTitle.trim());
    }
    setEditingSessionId(null);
  };

  return (
    <div className="flex flex-col h-full bg-white select-none relative z-10">
      {/* Header (48px) */}
      <div className="h-[48px] px-3.5 border-b border-[#e3e6ea] flex items-center justify-between flex-shrink-0">
        {/* Session Title & Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSessionMenu(!showSessionMenu)}
            className="flex items-center space-x-1.5 text-[14px] font-semibold text-[#1f2329] hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors max-w-[180px]"
          >
            <span className="truncate">{activeSession?.title || '新对话'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          </button>

          {/* Sessions Dropdown Menu */}
          {showSessionMenu && (
            <div className="absolute top-10 left-0 w-64 bg-white border border-[#e3e6ea] rounded-xl shadow-lg py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>历史对话</span>
                <button
                  onClick={() => {
                    onCreateSession();
                    setShowSessionMenu(false);
                  }}
                  className="text-blue-600 hover:text-blue-700 capitalize flex items-center space-x-0.5"
                >
                  <Plus className="w-3 h-3" />
                  <span>新建</span>
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto py-1">
                {sessions.map((s) => {
                  const isCurrent = s.id === activeSession?.id;
                  const isRenaming = editingSessionId === s.id;

                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        onSelectSession(s.id);
                        setShowSessionMenu(false);
                      }}
                      className={`group flex items-center justify-between px-3 py-2 text-[12.5px] cursor-pointer hover:bg-slate-50 ${
                        isCurrent ? 'bg-blue-50/70 text-blue-600 font-medium' : 'text-slate-700'
                      }`}
                    >
                      {isRenaming ? (
                        <div
                          className="flex items-center space-x-1 flex-1 mr-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full text-[12px] px-1 py-0.5 border border-blue-400 rounded bg-white text-slate-800"
                            autoFocus
                          />
                          <button
                            onClick={(e) => handleSaveRename(s.id, e)}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2 truncate flex-1 mr-2">
                          <MessageSquare className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                          <span className="truncate">{s.title}</span>
                        </div>
                      )}

                      {!isRenaming && (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 flex-shrink-0">
                          <button
                            onClick={(e) => handleStartRename(s, e)}
                            className="p-0.5 rounded text-slate-400 hover:text-slate-700"
                            title="重命名"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          {sessions.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession(s.id);
                              }}
                              className="p-0.5 rounded text-slate-400 hover:text-red-600"
                              title="删除会话"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center space-x-1">
          {/* New Conversation Button (Images 1, 2, 3, 4) */}
          <button
            onClick={onCreateSession}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-[#e3e6ea] text-[12px] font-medium text-blue-600 hover:bg-blue-50 transition-colors shadow-2xs"
            title="新建对话"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建对话</span>
          </button>

          {/* History Icon */}
          <button
            onClick={() => setShowSessionMenu(!showSessionMenu)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
            title="对话历史"
          >
            <History className="w-4 h-4" />
          </button>

          {/* Collapse Panel Button */}
          <button
            onClick={onCollapse}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="收起对话面板"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {activeSession?.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">
                AI 文档分析助手
              </h3>
              <p className="text-[12.5px] text-slate-500 mt-1 max-w-[240px]">
                你可以针对当前文档提问、框选图表分析趋势，或让 AI 辅助总结重点。
              </p>
            </div>
          </div>
        ) : (
          activeSession?.messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              showSystemAction={showSystemAction}
              onJumpToCitation={onJumpToCitation}
              onUndoSystemAction={onUndoSystemAction}
              onRegenerate={onRegenerate}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Input Area */}
      <Composer
        onSendMessage={onSendMessage}
        isStreaming={isStreaming}
        onStopStreaming={onStopStreaming}
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
        selectedModel={activeSession?.model || availableModels[0]}
        onSelectModel={(model) => {
          if (activeSession) activeSession.model = model;
        }}
        availableModels={availableModels}
      />
    </div>
  );
};
