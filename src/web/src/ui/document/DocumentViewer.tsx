import React, { useRef } from 'react';
import type { DocTab, ToolType, AnnotationColor } from '../../types';
import { PageReport2025 } from './PageReport2025';
import { PageContractScanned } from './PageContractScanned';
import { PageMeetingMinutes } from './PageMeetingMinutes';
import { FindBar } from './FindBar';
import { FileUp, FolderOpen, Clock } from 'lucide-react';

interface DocumentViewerProps {
  activeTab?: DocTab;
  scale: number;
  rotation: number;
  currentTool: ToolType;
  currentColor: AnnotationColor;
  strokeWidth?: number;
  showAnnotations: boolean;
  showChartAnnotations?: boolean;
  showNoteCard: boolean;
  onToggleNoteCard: () => void;
  showSelectionBar: boolean;
  onToggleSelectionBar: () => void;
  isRegionAskActive: boolean;
  onConfirmRegionAsk: () => void;
  onCancelRegionAsk: () => void;
  onAskAiWithSelection: (text: string) => void;
  onHighlightSelection: () => void;
  onUnderlineSelection: () => void;
  isSearchOpen: boolean;
  onCloseSearch: () => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  currentMatchIndex: number;
  totalMatches: number;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onOpenFile: () => void;
  onOpenRecent: (title: string) => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  activeTab,
  scale,
  rotation,
  currentTool,
  currentColor,
  showAnnotations,
  showChartAnnotations = false,
  showNoteCard,
  onToggleNoteCard,
  showSelectionBar,
  onToggleSelectionBar,
  isRegionAskActive,
  onConfirmRegionAsk,
  onCancelRegionAsk,
  onAskAiWithSelection,
  onHighlightSelection,
  onUnderlineSelection,
  isSearchOpen,
  onCloseSearch,
  searchTerm,
  onSearchTermChange,
  currentMatchIndex,
  totalMatches,
  onNextMatch,
  onPrevMatch,
  onOpenFile,
  onOpenRecent,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // If no document is open, render empty state (Design doc 10.12)
  if (!activeTab) {
    return (
      <div className="flex-1 bg-[#e6e8ec] flex items-center justify-center p-8 select-none">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md border border-[#e3e6ea] p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
            <FileUp className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-[18px] font-bold text-[#1f2329]">
              拖放 PDF 或图片到此处
            </h2>
            <p className="text-[13px] text-slate-500 mt-1">
              支持文字型 PDF、扫描件 PDF、PNG、JPEG 图片
            </p>
          </div>

          <button
            onClick={onOpenFile}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-[14px] shadow-sm transition-colors flex items-center justify-center space-x-2"
          >
            <FolderOpen className="w-4 h-4" />
            <span>打开本地文档</span>
          </button>

          {/* Recent Documents */}
          <div className="pt-4 border-t border-slate-150 text-left">
            <div className="flex items-center space-x-1.5 text-[12px] font-semibold text-slate-400 mb-3 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5" />
              <span>最近打开</span>
            </div>
            <div className="space-y-1.5 text-[13px]">
              {['2025年度报告.pdf', '采购合同-扫描件.pdf', '会议纪要.png'].map((name) => (
                <div
                  key={name}
                  onClick={() => onOpenRecent(name)}
                  className="p-2 rounded-lg hover:bg-slate-50 text-slate-700 hover:text-blue-600 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <span className="font-medium truncate">{name}</span>
                  <span className="text-[11px] text-slate-400">昨天</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-[#e6e8ec] overflow-auto relative p-6 flex"
    >
      {/* Floating Find Bar */}
      <FindBar
        isOpen={isSearchOpen}
        onClose={onCloseSearch}
        searchTerm={searchTerm}
        onSearchTermChange={onSearchTermChange}
        currentMatchIndex={currentMatchIndex}
        totalMatches={totalMatches}
        onNextMatch={onNextMatch}
        onPrevMatch={onPrevMatch}
        unrecognizedPages={activeTab.ocrStatus?.unrecognizedPages}
      />

      {/* Scalable & Rotatable Paper Sheet Wrapper */}
      <div className="min-w-fit m-auto flex justify-center py-4">
        <div
          style={{
            zoom: scale,
            transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
            transition: 'transform 0.15s ease-out',
          }}
          className="my-2"
        >
        {activeTab.id === 'doc-1' && (
          <PageReport2025
            currentTool={currentTool}
            currentColor={currentColor}
            showAnnotations={showAnnotations}
            showChartAnnotations={showChartAnnotations}
            showNoteCard={showNoteCard}
            onToggleNoteCard={onToggleNoteCard}
            showSelectionBar={showSelectionBar}
            onToggleSelectionBar={onToggleSelectionBar}
            isRegionAskActive={isRegionAskActive}
            onConfirmRegionAsk={onConfirmRegionAsk}
            onCancelRegionAsk={onCancelRegionAsk}
            onAskAiWithSelection={onAskAiWithSelection}
            onHighlightSelection={onHighlightSelection}
            onUnderlineSelection={onUnderlineSelection}
          />
        )}

        {activeTab.id === 'doc-2' && (
          <PageContractScanned
            searchTerm={searchTerm}
            isOcrRunning={activeTab.ocrStatus?.isRecognizing}
          />
        )}

        {activeTab.id === 'doc-3' && <PageMeetingMinutes />}
        </div>
      </div>
    </div>
  );
};
