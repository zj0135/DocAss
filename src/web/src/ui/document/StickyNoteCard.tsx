import React, { useState } from 'react';
import { MessageSquare, X, Check, Trash2 } from 'lucide-react';

interface StickyNoteCardProps {
  author: string;
  date: string;
  content: string;
  onUpdateContent: (content: string) => void;
  onDelete: () => void;
  onClose: () => void;
  position: { x: number; y: number };
  editImmediately?: boolean;
  controlledDraft?: string;
  onDraftChange?: (text:string)=>void;
  onCancel?:()=>void;
}

export const StickyNoteCard: React.FC<StickyNoteCardProps> = ({
  author,
  date,
  content,
  onUpdateContent,
  onDelete,
  onClose,
  position,
  editImmediately=false,controlledDraft,onDraftChange,onCancel,
}) => {
  const [isEditing, setIsEditing] = useState(editImmediately);
  const [editValue, setEditValue] = useState(content);

  const handleSave = () => {
    onUpdateContent(controlledDraft??editValue);
    setIsEditing(false);
  };

  return (
    <div
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="absolute z-30 w-[240px] bg-[#fffbeb] border border-[#fde68a] rounded-xl shadow-lg p-3 text-left animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#fef3c7] mb-2 text-[#92400e]">
        <div className="flex items-center space-x-1.5 text-[12px] font-semibold">
          <div className="w-4 h-4 rounded bg-[#f59e0b] text-white flex items-center justify-center">
            <MessageSquare className="w-2.5 h-2.5" />
          </div>
          <span>{author}</span>
          <span className="text-[10px] font-normal text-[#b45309]">{date}</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded text-[#b45309] hover:bg-[#fde68a] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            aria-label="便签内容"
            value={controlledDraft??editValue}
            maxLength={20000}
            onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing)return;if(e.key==='Escape'){e.preventDefault();onCancel?.();}}}
            onChange={(e) => {setEditValue(e.target.value);onDraftChange?.(e.target.value);}}
            className="w-full text-[12.5px] p-1.5 bg-white border border-[#fcd34d] rounded-md focus:outline-hidden focus:ring-1 focus:ring-amber-500 text-slate-800 resize-none h-18"
            autoFocus
          />
          <div className="flex justify-end space-x-1.5">
            <button
              onClick={() => {setIsEditing(false);onCancel?.();}}
              className="px-2 py-1 text-[11px] rounded text-slate-600 hover:bg-[#fef3c7]"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-2 py-1 text-[11px] rounded bg-amber-500 hover:bg-amber-600 text-white font-medium flex items-center space-x-1"
            >
              <Check className="w-3 h-3" />
              <span>保存</span>
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p
            onClick={() => setIsEditing(true)}
            className="text-[12.5px] text-[#78350f] leading-relaxed cursor-text hover:bg-amber-100/50 p-1 rounded transition-colors"
          >
            {content}
          </p>
          <div className="flex justify-between items-center mt-2.5 pt-1.5 border-t border-[#fef3c7]">
            <button
              onClick={() => setIsEditing(true)}
              className="text-[11px] text-[#b45309] hover:text-[#92400e] underline"
            >
              编辑
            </button>
            <button
              onClick={onDelete}
              className="text-[11px] text-red-500 hover:text-red-700 flex items-center space-x-0.5"
            >
              <Trash2 className="w-3 h-3" />
              <span>删除</span>
            </button>
          </div>
        </div>
      )}

      {/* Pointing arrow down-left */}
      <div className="absolute -bottom-2 left-6 w-3 h-3 bg-[#fffbeb] border-b border-r border-[#fde68a] transform rotate-45" />
    </div>
  );
};
