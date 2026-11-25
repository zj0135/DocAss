import React, { useState, useEffect, useRef } from 'react';
import type {
  DocTab,
  ToolType,
  AnnotationColor,
  SidePanelType,
  AnyAnnotation,
  ChatSession,
  AppSettings,
  ChatAttachment,
} from '../types';
import {
  initialTabs,
  initialOutline,
  initialAnnotations,
  initialChatSessions,
  initialSettings,
} from './mockData';
import { TitleBar } from '../ui/TitleBar';
import { Toolbar } from '../ui/Toolbar';
import { ToolRail } from '../ui/ToolRail';
import { Splitter } from '../ui/Splitter';
import { StatusBar } from '../ui/StatusBar';
import { ThumbnailPanel } from '../ui/panels/ThumbnailPanel';
import { OutlinePanel } from '../ui/panels/OutlinePanel';
import { AnnotationPanel } from '../ui/panels/AnnotationPanel';
import { DocumentViewer } from '../ui/document/DocumentViewer';
import { ChatPanel } from '../ui/chat/ChatPanel';
import { SettingsDialog } from '../ui/settings/SettingsDialog';
import { PrototypeSceneSelector } from '../ui/demo/PrototypeSceneSelector';
import { Sparkles } from 'lucide-react';
import { createServices } from '../services';

export const App: React.FC = () => {
  const services = createServices();
  const replyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopReply = () => { clearTimeout(replyTimer.current); replyTimer.current = undefined; setIsStreaming(false); };
  useEffect(() => () => clearTimeout(replyTimer.current), []);
  // Tabs State
  const [tabs, setTabs] = useState<DocTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string>('doc-1');

  // App UI State
  const [activePanel, setActivePanel] = useState<SidePanelType>('none');
  const [currentTool, setCurrentTool] = useState<ToolType>('select');
  const [currentColor, setCurrentColor] = useState<AnnotationColor>('#3B82F6');
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [scale, setScale] = useState<number>(1.25);
  const [rotation, setRotation] = useState<number>(0);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  useEffect(() => {
    if (!services.capabilities.window) return;
    void services.bootstrap().then(info => setIsMaximized(info.window.maximized));
    return services.window.subscribe(setIsMaximized);
  }, [services]);

  // Chat Panel Layout
  const [chatWidth, setChatWidth] = useState<number>(440);
  const [isChatCollapsed, setIsChatCollapsed] = useState<boolean>(false);
  const [isDraggingSplitter, setIsDraggingSplitter] = useState<boolean>(false);

  // Overlays & Interactive Mock States
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [showChartAnnotations, setShowChartAnnotations] = useState<boolean>(false);
  const [showNoteCard, setShowNoteCard] = useState<boolean>(false);
  const [showSelectionBar, setShowSelectionBar] = useState<boolean>(true);
  const [isRegionAskActive, setIsRegionAskActive] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('违约责任');
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(3);
  const [totalMatches, setTotalMatches] = useState<number>(11);

  // Annotations & Chat State
  const [annotations, setAnnotations] = useState<AnyAnnotation[]>(initialAnnotations);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | undefined>('ann-3');
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(initialChatSessions);
  const [activeSessionId, setActiveSessionId] = useState<string>('conv-1');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  // Settings
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Current Prototype Scene (1 to 5)
  const [currentScene, setCurrentScene] = useState<number>(1);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Update active tab property immutably
  const updateActiveTab = (updates: Partial<DocTab>) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, ...updates } : t))
    );
  };

  // Quick Switcher for the 5 Prototype Scenes
  const handleSelectScene = (sceneId: number) => {
    setCurrentScene(sceneId);

    if (sceneId === 1) {
      // Prototype 1: Main Interface Overview (image1.png)
      setActiveTabId('doc-1');
      setCurrentTool('select');
      setActivePanel('none');
      setShowAnnotations(true);
      setShowChartAnnotations(false);
      setShowNoteCard(false);
      setShowSelectionBar(true);
      setIsRegionAskActive(false);
      setIsSearchOpen(false);
      setActiveSessionId('conv-1');
      setIsStreaming(false);
      setIsChatCollapsed(false);
      setIsSettingsOpen(false);
    } else if (sceneId === 2) {
      // Prototype 2: Annotation Mode & Sticky Note (image2.png)
      setActiveTabId('doc-1');
      setCurrentTool('ink');
      setActivePanel('annotations');
      setShowAnnotations(true);
      setShowChartAnnotations(true);
      setShowNoteCard(true);
      setShowSelectionBar(false);
      setIsRegionAskActive(false);
      setIsSearchOpen(false);
      setSelectedAnnotationId('ann-3');
      setActiveSessionId('conv-1');
      setIsStreaming(false);
      setIsChatCollapsed(false);
      setIsSettingsOpen(false);
    } else if (sceneId === 3) {
      // Prototype 3: Region Ask (image3.png)
      setActiveTabId('doc-1');
      setCurrentTool('regionAsk');
      setActivePanel('none');
      setShowAnnotations(false);
      setShowChartAnnotations(false);
      setShowNoteCard(false);
      setShowSelectionBar(false);
      setIsRegionAskActive(true);
      setIsSearchOpen(false);
      setActiveSessionId('conv-2');
      setIsStreaming(true);
      setIsChatCollapsed(false);
      setIsSettingsOpen(false);
    } else if (sceneId === 4) {
      // Prototype 4: Scanned Contract & OCR (image4.png)
      setActiveTabId('doc-2');
      setCurrentTool('select');
      setActivePanel('none');
      setShowAnnotations(false);
      setShowChartAnnotations(false);
      setShowNoteCard(false);
      setShowSelectionBar(false);
      setIsRegionAskActive(false);
      setIsSearchOpen(true);
      setSearchTerm('违约责任');
      setCurrentMatchIndex(3);
      setTotalMatches(11);
      setActiveSessionId('conv-3');
      setIsStreaming(false);
      setIsChatCollapsed(false);
      setIsSettingsOpen(false);
    } else if (sceneId === 5) {
      // Prototype 5: Settings Dialog (image5.png)
      setActiveTabId('doc-1');
      setIsSettingsOpen(true);
    }
  };

  // Splitter Dragging Logic
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSplitter(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplitter) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 320 && newWidth <= 640) {
        setChatWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSplitter(false);
    };

    if (isDraggingSplitter) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSplitter]);

  // Tab Handlers
  const handleSelectTab = (id: string) => {
    setActiveTabId(id);
    const tab = tabs.find((t) => t.id === id);
    if (tab) {
      setScale(tab.scale);
      setRotation(tab.rotation);
      if (tab.id === 'doc-2') {
        setIsSearchOpen(true);
        setActiveSessionId('conv-3');
      } else {
        setIsSearchOpen(false);
        setActiveSessionId('conv-1');
      }
    }
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeTabId === id && remaining.length > 0) {
      setActiveTabId(remaining[0].id);
    }
  };

  const handleAddTab = () => {
    const newId = `doc-${Date.now()}`;
    const newTab: DocTab = {
      id: newId,
      docHash: 'e92bc0182741',
      title: `新建文档-${tabs.length + 1}.pdf`,
      kind: 'pdf',
      pageCount: 15,
      currentPage: 1,
      scale: 1.25,
      rotation: 0,
      textSource: 'native',
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
  };

  // Chat Handlers
  const handleSendMessage = (content: string, attachments?: ChatAttachment[]) => {
    clearTimeout(replyTimer.current);
    const active = chatSessions.find((s) => s.id === activeSessionId);
    if (!active) return;

    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      content,
      createdAt: '刚刚',
      attachments: attachments && attachments.length > 0 ? [...attachments] : undefined,
    };

    const updatedSessions = chatSessions.map((s) =>
      s.id === activeSessionId
        ? { ...s, messages: [...s.messages, userMsg] }
        : s
    );
    setChatSessions(updatedSessions);
    setPendingAttachments([]);
    setIsStreaming(true);

    // Mock simulated assistant streaming response
    replyTimer.current = setTimeout(() => {
      const assistantMsg = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant' as const,
        content: `根据对文档《${activeTab?.title}》的分析：针对您提出的问题，第三季度受宏观经济波动与行业竞争加剧影响，营收有一定回落，但第四季度通过优化销售渠道，业绩已强劲回升至 128.6 亿元。[[p12|第 12 页]]`,
        createdAt: '刚刚',
        isStreaming: false,
        toolCalls: [
          {
            id: `t-${Date.now()}`,
            icon: 'search' as const,
            text: `已检索相关章节并分析数据`,
            status: 'completed' as const,
          },
        ],
      };
      setChatSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? { ...s, messages: [...s.messages, assistantMsg] }
            : s
        )
      );
      setIsStreaming(false);
    }, 1200);
  };

  const handleCreateSession = () => {
    const newId = `conv-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      docId: activeTabId,
      title: `新对话 ${chatSessions.length + 1}`,
      model: 'DeepSeek-R1',
      updatedAt: '刚刚',
      messages: [],
    };
    setChatSessions([newSession, ...chatSessions]);
    setActiveSessionId(newId);
  };

  const handleDeleteSession = (id: string) => {
    const remaining = chatSessions.filter((s) => s.id !== id);
    setChatSessions(remaining);
    if (activeSessionId === id && remaining.length > 0) {
      setActiveSessionId(remaining[0].id);
    }
  };

  const handleRenameSession = (id: string, newTitle: string) => {
    setChatSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: newTitle } : s))
    );
  };

  // Tool Selection
  const handleSelectTool = (tool: ToolType) => {
    setCurrentTool(tool);
    if (tool === 'regionAsk') {
      setIsRegionAskActive(true);
      setShowAnnotations(false);
    } else {
      setIsRegionAskActive(false);
    }
  };

  // Ask AI with Selection (FloatingBar action)
  const handleAskAiWithSelection = (text: string) => {
    setIsChatCollapsed(false);
    handleSendMessage(`请针对以下选中文本进行详细分析：\n"${text}"`);
  };

  // Confirm Region Ask (Image 3)
  const handleConfirmRegionAsk = () => {
    setIsRegionAskActive(false);
    setIsChatCollapsed(false);
    setActiveSessionId('conv-2');
    setIsStreaming(true);
  };

  // Jump to Citation Page
  const handleJumpToCitation = (page: number) => {
    updateActiveTab({ currentPage: page });
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f5f6f8] select-none text-[#1f2329]">
      {/* 1. Title Bar (48px) */}
      <TitleBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onAddTab={handleAddTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isMaximized={isMaximized}
        windowEnabled={services.capabilities.window}
        onMinimize={() => void services.window.minimize()}
        onRequestClose={() => void services.window.requestClose()}
        onToggleMaximize={() => void services.window.maximize()}
      />

      {/* 2. Toolbar (44px) */}
      <Toolbar
        currentTool={currentTool}
        onSelectTool={handleSelectTool}
        currentColor={currentColor}
        onSelectColor={setCurrentColor}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
        scale={scale}
        onScaleChange={setScale}
        rotation={rotation}
        onRotate={() => setRotation((rotation + 90) % 360)}
        onToggleSearch={() => setIsSearchOpen(!isSearchOpen)}
        isSearchOpen={isSearchOpen}
        canUndo={true}
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
        onFitWidth={() => setScale(1.0)}
      />

      {/* 3. Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Tool Rail (48px) */}
        <ToolRail
          activePanel={activePanel}
          onTogglePanel={(panel) =>
            setActivePanel(activePanel === panel ? 'none' : panel)
          }
          onSelectPointer={() => {
            setCurrentTool('select');
            setActivePanel('none');
          }}
          isPointerActive={currentTool === 'select'}
          annotationCount={annotations.length}
        />

        {/* Expandable Left Side Panel (280px) */}
        {activePanel === 'thumbnails' && (
          <ThumbnailPanel
            pageCount={activeTab?.pageCount || 1}
            currentPage={activeTab?.currentPage || 1}
            onSelectPage={(p) => updateActiveTab({ currentPage: p })}
            onClose={() => setActivePanel('none')}
          />
        )}

        {activePanel === 'outline' && (
          <OutlinePanel
            outline={initialOutline}
            currentPage={activeTab?.currentPage || 1}
            onSelectPage={(p) => updateActiveTab({ currentPage: p })}
            onClose={() => setActivePanel('none')}
          />
        )}

        {activePanel === 'annotations' && (
          <AnnotationPanel
            annotations={annotations}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={(id, page) => {
              setSelectedAnnotationId(id);
              updateActiveTab({ currentPage: page });
            }}
            onDeleteAnnotation={(id, e) => {
              e.stopPropagation();
              setAnnotations(annotations.filter((a) => a.id !== id));
            }}
            onClose={() => setActivePanel('none')}
          />
        )}

        {/* Center Document Area */}
        <DocumentViewer
          activeTab={activeTab}
          scale={scale}
          rotation={rotation}
          currentTool={currentTool}
          currentColor={currentColor}
          showAnnotations={showAnnotations}
          showChartAnnotations={showChartAnnotations}
          showNoteCard={showNoteCard}
          onToggleNoteCard={() => setShowNoteCard(!showNoteCard)}
          showSelectionBar={showSelectionBar}
          onToggleSelectionBar={() => setShowSelectionBar(!showSelectionBar)}
          isRegionAskActive={isRegionAskActive}
          onConfirmRegionAsk={handleConfirmRegionAsk}
          onCancelRegionAsk={() => setIsRegionAskActive(false)}
          onAskAiWithSelection={handleAskAiWithSelection}
          onHighlightSelection={() => {
            setShowAnnotations(true);
            setShowSelectionBar(false);
          }}
          onUnderlineSelection={() => {
            setShowAnnotations(true);
            setShowSelectionBar(false);
          }}
          isSearchOpen={isSearchOpen}
          onCloseSearch={() => setIsSearchOpen(false)}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          currentMatchIndex={currentMatchIndex}
          totalMatches={totalMatches}
          onNextMatch={() =>
            setCurrentMatchIndex(currentMatchIndex < totalMatches ? currentMatchIndex + 1 : 1)
          }
          onPrevMatch={() =>
            setCurrentMatchIndex(currentMatchIndex > 1 ? currentMatchIndex - 1 : totalMatches)
          }
          onOpenFile={handleAddTab}
          onOpenRecent={(title) => {
            const found = tabs.find((t) => t.title === title);
            if (found) handleSelectTab(found.id);
          }}
        />

        {/* Draggable Splitter */}
        {!isChatCollapsed && (
          <Splitter
            onMouseDown={handleSplitterMouseDown}
            onDoubleClick={() => setChatWidth(window.innerWidth * 0.35)}
            isDragging={isDraggingSplitter}
          />
        )}

        {/* Right Chat Panel (Resizable & Collapsible) */}
        {!isChatCollapsed ? (
          <div
            style={{ width: `${chatWidth}px` }}
            className="h-full flex-shrink-0 border-l border-[#e3e6ea]"
          >
            <ChatPanel
              sessions={chatSessions}
              activeSessionId={activeSessionId}
              onSelectSession={setActiveSessionId}
              onCreateSession={handleCreateSession}
              onDeleteSession={handleDeleteSession}
              onRenameSession={handleRenameSession}
              onSendMessage={handleSendMessage}
              isStreaming={isStreaming}
              onStopStreaming={stopReply}
              attachments={pendingAttachments}
              onRemoveAttachment={(id) =>
                setPendingAttachments(pendingAttachments.filter((a) => a.id !== id))
              }
              onJumpToCitation={handleJumpToCitation}
              onUndoSystemAction={() => {
                setShowAnnotations(false);
              }}
              onRegenerate={() => {
                clearTimeout(replyTimer.current);
                setIsStreaming(true);
                replyTimer.current = setTimeout(() => setIsStreaming(false), 1000);
              }}
              onCollapse={() => setIsChatCollapsed(true)}
              availableModels={['DeepSeek-R1', 'DeepSeek-V3', 'gpt-4o', 'qwen-max']}
              showSystemAction={currentScene === 2}
            />
          </div>
        ) : (
          /* Collapsed 40px Chat Vertical Bar */
          <div
            onClick={() => setIsChatCollapsed(false)}
            className="w-[40px] bg-white border-l border-[#e3e6ea] flex flex-col items-center py-4 cursor-pointer hover:bg-slate-50 transition-colors flex-shrink-0 text-slate-500 hover:text-blue-600"
            title="展开对话面板"
          >
            <Sparkles className="w-4 h-4 mb-3 text-blue-600" />
            <span
              className="text-[12px] font-medium tracking-widest uppercase"
              style={{ writingMode: 'vertical-rl' }}
            >
              AI 助手
            </span>
          </div>
        )}
      </div>

      {/* 4. Status Bar (28px) */}
      <StatusBar
        activeTab={activeTab}
        onPageChange={(p) => updateActiveTab({ currentPage: p })}
        scale={scale}
        onScaleChange={setScale}
        isSaved={currentScene === 2}
        onCancelOcr={() => {
          if (activeTab?.ocrStatus) {
            updateActiveTab({
              ocrStatus: { ...activeTab.ocrStatus, isRecognizing: false },
            });
          }
        }}
      />

      {/* 5. Settings Modal Dialog */}
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={setSettings}
      />

      {/* 6. Prototype Scene Quick Preset Selector (1-5) */}
      <PrototypeSceneSelector
        currentScene={currentScene}
        onSelectScene={handleSelectScene}
      />
    </div>
  );
};

export default App;
