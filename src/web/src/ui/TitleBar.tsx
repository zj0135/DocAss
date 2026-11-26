import React from 'react';
import type { DocTab } from '../types';
import {
  FileText,
  Image as ImageIcon,
  Plus,
  Settings,
  Minus,
  Square,
  X,
  Layers,
  Copy,
} from 'lucide-react';

interface TitleBarProps {
  tabs: DocTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  onAddTab: () => void;
  onOpenSettings: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onMinimize?: () => void;
  onRequestClose?: () => void;
  windowEnabled?: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onOpenSettings,
  isMaximized,
  onToggleMaximize,
  onMinimize,
  onRequestClose,
  windowEnabled = false,
}) => {
  return (
    <header className="native-titlebar h-[48px] bg-[#f5f6f8] border-b border-[#e3e6ea] flex items-center justify-between px-3 select-none flex-shrink-0 z-30">
      {/* Left: App Logo & Brand */}
      <div className="flex items-center space-x-2.5 mr-4 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
          <Layers className="w-4 h-4" />
        </div>
        <span className="font-semibold text-[13.5px] text-[#1f2329] tracking-tight">
          DocAss 文档助手
        </span>
      </div>

      {/* Middle: Tab Strip */}
      <div className="flex items-center space-x-1.5 flex-1 overflow-x-auto no-scrollbar max-w-[calc(100vw-360px)]">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const isPdf = tab.kind === 'pdf' || tab.kind === 'scanned-pdf';

          return (
            <div
              key={tab.id}
              data-no-drag
              onClick={() => onSelectTab(tab.id)}
              className={`group relative flex items-center h-[34px] px-3 rounded-lg text-[13px] cursor-pointer transition-all duration-150 max-w-[210px] min-w-[140px] ${
                isActive
                  ? 'bg-white text-[#1f2329] shadow-sm font-medium border border-[#e3e6ea]'
                  : 'text-[#5f6672] hover:bg-[#eaecee] hover:text-[#1f2329]'
              }`}
            >
              {/* Tab Type Icon */}
              <div className="mr-2 flex-shrink-0">
                {isPdf ? (
                  <div className="w-4 h-4 rounded bg-red-50 text-red-600 flex items-center justify-center">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded bg-blue-50 text-blue-600 flex items-center justify-center">
                    <ImageIcon className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>

              {/* Title */}
              <span className="truncate flex-1 text-left">{tab.title}</span>

              {/* Close Button */}
              <button
                onClick={e => onCloseTab(tab.id, e)}
                className={`ml-1.5 p-0.5 rounded hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 transition-opacity ${
                  isActive
                    ? 'opacity-70 group-hover:opacity-100'
                    : 'opacity-0 group-hover:opacity-80'
                }`}
                title="关闭标签页 (Ctrl+W)"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Active Tab Accent Bar */}
              {isActive && (
                <div className="absolute top-0 left-3 right-3 h-[2px] bg-blue-600 rounded-b" />
              )}
            </div>
          );
        })}

        {/* Add Tab Button */}
        <button
          onClick={onAddTab}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#5f6672] hover:bg-[#eaecee] hover:text-[#1f2329] transition-colors flex-shrink-0"
          title="打开新文档 (Ctrl+O)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Settings & Window Controls */}
      <div className="flex items-center space-x-1 flex-shrink-0 ml-3">
        <button
          onClick={onOpenSettings}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#5f6672] hover:bg-[#eaecee] hover:text-[#1f2329] transition-colors"
          title="设置"
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-[#e3e6ea] mx-1" />

        <button
          onClick={onMinimize}
          disabled={!windowEnabled}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#5f6672] hover:bg-[#eaecee] transition-colors"
          title="最小化"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onToggleMaximize}
          disabled={!windowEnabled}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#5f6672] hover:bg-[#eaecee] transition-colors"
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          onClick={onRequestClose}
          disabled={!windowEnabled}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#5f6672] hover:bg-red-500 hover:text-white transition-colors"
          title="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
