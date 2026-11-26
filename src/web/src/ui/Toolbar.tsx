import React, { useState, useRef, useEffect } from 'react';
import type { ToolType, AnnotationColor } from '../types';
import {
  MousePointer2,
  Highlighter,
  Underline as UnderlineIcon,
  MessageSquare,
  Type,
  PenLine,
  Square as SquareIcon,
  ArrowUpRight,
  Scan,
  Eraser,
  Undo2,
  Redo2,
  Minus,
  Plus,
  RotateCw,
  Search,
  ChevronDown,
  Maximize2,
  Fullscreen,
  Sliders,
} from 'lucide-react';
import { CustomSelect } from './primitives/CustomSelect';
import { CustomColorSwatch } from './primitives/CustomControls';

interface ToolbarProps<C extends string = string> {
  currentTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  currentColor: C;
  onSelectColor: (color: C) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  rotation: number;
  onRotate: () => void;
  onToggleSearch: () => void;
  isSearchOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onFitWidth: () => void;
  onFitPage?: () => void;
  fitMode?: 'manual' | 'width' | 'page';
  toolsDisabled?: boolean;
  showRegionAsk?: boolean;
}

export function Toolbar<C extends string = AnnotationColor>({
  currentTool,
  onSelectTool,
  currentColor,
  onSelectColor,
  strokeWidth,
  onStrokeWidthChange,
  opacity,
  onOpacityChange,
  scale,
  onScaleChange,
  onRotate,
  onToggleSearch,
  isSearchOpen,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFitWidth,
  onFitPage,
  fitMode,
  toolsDisabled = false,
  showRegionAsk = true,
}: ToolbarProps<C>) {
  const [showColorPopover, setShowColorPopover] = useState(false);
  const [showScaleDropdown, setShowScaleDropdown] = useState(false);
  const colorPopoverRef = useRef<HTMLDivElement>(null);
  const scaleDropdownRef = useRef<HTMLDivElement>(null);

  const colors: { value: AnnotationColor; label: string }[] = [
    { value: '#3B82F6', label: '蓝色' },
    { value: '#F6C445', label: '黄色' },
    { value: '#EF4444', label: '红色' },
    { value: '#22C55E', label: '绿色' },
    { value: '#A855F7', label: '紫色' },
  ];

  const scalePresets = [
    { label: '50%', value: 0.5 },
    { label: '75%', value: 0.75 },
    { label: '100%', value: 1.0 },
    { label: '125%', value: 1.25 },
    { label: '150%', value: 1.5 },
    { label: '200%', value: 2.0 },
  ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPopoverRef.current && !colorPopoverRef.current.contains(e.target as Node)) {
        setShowColorPopover(false);
      }
      if (scaleDropdownRef.current && !scaleDropdownRef.current.contains(e.target as Node)) {
        setShowScaleDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toolItems: {
    id: ToolType;
    ariaLabel: string;
    title: string;
    icon: React.ReactNode;
    visible?: boolean;
  }[] = [
    { id: 'select', ariaLabel: '选择工具', title: '选择工具 (V)', icon: <MousePointer2 className="w-4 h-4" /> },
    { id: 'highlight', ariaLabel: '高亮工具', title: '文字高亮 (H)', icon: <Highlighter className="w-4 h-4" /> },
    { id: 'underline', ariaLabel: '下划线工具', title: '文字下划线 (U)', icon: <UnderlineIcon className="w-4 h-4" /> },
    { id: 'note', ariaLabel: '便签工具', title: '便签 (N)', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'freetext', ariaLabel: '文字批注工具', title: '文字批注 (T)', icon: <Type className="w-4 h-4" /> },
    { id: 'ink', ariaLabel: '手绘工具', title: '画笔 (P)', icon: <PenLine className="w-4 h-4" /> },
    { id: 'rect', ariaLabel: '矩形工具', title: '矩形 (R)', icon: <SquareIcon className="w-4 h-4" /> },
    { id: 'arrow', ariaLabel: '箭头工具', title: '箭头 (A)', icon: <ArrowUpRight className="w-4 h-4" /> },
    { id: 'regionAsk', ariaLabel: '框选问 AI', title: '框选提问 (Q)', icon: <Scan className="w-4 h-4" />, visible: showRegionAsk },
    { id: 'eraser', ariaLabel: '橡皮擦工具', title: '橡皮擦 (E)', icon: <Eraser className="w-4 h-4" /> },
  ];

  return (
    <div
      className="h-[44px] bg-white/95 backdrop-blur-xs border-b border-[#e3e6ea] px-3 flex items-center justify-between select-none relative z-20 flex-shrink-0 gap-2"
      aria-label="标注工具栏"
    >
      {/* Left: Tools Group */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        {toolItems
          .filter((item) => item.visible !== false)
          .map((item) => {
            const active = currentTool === item.id;
            const disabled = toolsDisabled && item.id !== 'select' && item.id !== 'regionAsk';
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.ariaLabel}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => onSelectTool(item.id)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-blue-50 text-blue-600 font-medium shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]'
                    : 'text-[#5f6672] hover:bg-slate-100 hover:text-[#1f2329]'
                }`}
                title={item.title}
              >
                {item.icon}
                <span className="sr-only">{item.ariaLabel}</span>
              </button>
            );
          })}

        <div className="w-[1px] h-5 bg-[#e3e6ea] mx-2" />

        {/* Color Palette & Bespoke Stroke Width Dropdown */}
        <div className="relative flex items-center space-x-1.5" ref={colorPopoverRef}>
          <div className="flex items-center space-x-1.5 px-1.5 py-1 rounded-lg">
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => onSelectColor(c.value as unknown as C)}
                style={{ backgroundColor: c.value }}
                className={`w-4 h-4 rounded-full transition-all duration-150 ${
                  currentColor.toUpperCase() === c.value.toUpperCase()
                    ? 'scale-125 ring-2 ring-offset-1 ring-blue-500 shadow-xs'
                    : 'hover:scale-110 opacity-90'
                }`}
                title={c.label}
              />
            ))}
          </div>

          <CustomSelect
            ariaLabel="工具线宽"
            size="xs"
            value={String(strokeWidth)}
            onChange={(v) => onStrokeWidthChange(Number(v))}
            options={[1, 2, 3, 5, 8].map((v) => ({ value: String(v), label: `${v}px` }))}
            triggerClassName="bg-slate-100/70 border-transparent hover:bg-slate-200/70 shadow-none"
            title="线条粗细"
          />

          <button
            type="button"
            onClick={() => setShowColorPopover(!showColorPopover)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              showColorPopover
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
            }`}
            title="颜色、线宽与不透明度"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          {showColorPopover && (
            <div className="animate-surface-in absolute top-10 left-0 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-[0_14px_34px_-8px_rgba(15,23,42,0.18)] p-4 w-64 z-50">
              <div className="flex items-center justify-between text-[12px] font-medium text-[#5f6672] mb-2.5">
                <span>标注颜色</span>
                <label className="flex items-center space-x-1.5 text-[11.5px] text-slate-500 cursor-pointer">
                  <span>自定义</span>
                  <CustomColorSwatch
                    ariaLabel="工具颜色"
                    value={currentColor}
                    onChange={(v) => onSelectColor(v as C)}
                  />
                </label>
              </div>
              <div className="flex items-center justify-between mb-4">
                {colors.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => onSelectColor(c.value as unknown as C)}
                    style={{ backgroundColor: c.value }}
                    className={`w-6 h-6 rounded-full transition-all ${
                      currentColor.toUpperCase() === c.value.toUpperCase()
                        ? 'ring-2 ring-offset-2 ring-blue-600 scale-110'
                        : 'hover:scale-105'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-[12px] font-medium text-[#5f6672] mb-1.5">
                <span>线条粗细</span>
                <span className="text-[#1f2329] font-mono">{strokeWidth}px</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={strokeWidth}
                onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
              />

              {opacity !== undefined && onOpacityChange && (
                <div className="mt-3.5 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-[12px] font-medium text-[#5f6672] mb-1.5">
                    <span>不透明度</span>
                    <span className="text-[#1f2329] font-mono">{Math.round(opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => onOpacityChange(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-[1px] h-5 bg-[#e3e6ea] mx-2" />

        {/* History: Undo / Redo */}
        <button
          type="button"
          aria-label="撤销"
          onClick={onUndo}
          disabled={!canUndo}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
            canUndo ? 'text-[#5f6672] hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'
          }`}
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
          <span className="sr-only">撤销</span>
        </button>
        <button
          type="button"
          aria-label="重做"
          onClick={onRedo}
          disabled={!canRedo}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
            canRedo ? 'text-[#5f6672] hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'
          }`}
          title="重做 (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
          <span className="sr-only">重做</span>
        </button>
      </div>

      {/* Right: Zoom & View Controls */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => onScaleChange(Math.max(0.25, scale - 0.25))}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5f6672] hover:bg-slate-100 transition-all active:scale-95"
          title="缩小 (Ctrl+-)"
        >
          <Minus className="w-4 h-4" />
        </button>

        <div className="relative" ref={scaleDropdownRef}>
          <button
            type="button"
            onClick={() => setShowScaleDropdown(!showScaleDropdown)}
            className="flex items-center space-x-1 px-2 h-8 rounded-lg text-[13px] font-medium text-[#1f2329] hover:bg-slate-100 transition-colors"
          >
            <span className="font-mono">{Math.round(scale * 100)}%</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                showScaleDropdown ? 'rotate-180 text-blue-600' : ''
              }`}
            />
          </button>

          {showScaleDropdown && (
            <div className="animate-surface-in absolute top-10 right-0 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl shadow-[0_14px_34px_-8px_rgba(15,23,42,0.18)] py-1.5 px-1.5 w-32 z-50 text-[13px]">
              {scalePresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onScaleChange(preset.value);
                    setShowScaleDropdown(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 flex items-center justify-between transition-colors ${
                    fitMode === 'manual' && Math.round(scale * 100) === Math.round(preset.value * 100)
                      ? 'text-blue-600 font-medium bg-blue-50/70'
                      : 'text-[#1f2329]'
                  }`}
                >
                  <span className="font-mono">{preset.label}</span>
                </button>
              ))}
              <div className="border-t border-slate-100 my-1" />
              <button
                type="button"
                onClick={() => {
                  onFitWidth();
                  setShowScaleDropdown(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-[#1f2329]"
              >
                适合宽度
              </button>
              {onFitPage && (
                <button
                  type="button"
                  onClick={() => {
                    onFitPage();
                    setShowScaleDropdown(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-[#1f2329]"
                >
                  适合整页
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onScaleChange(Math.min(5.0, scale + 0.25))}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5f6672] hover:bg-slate-100 transition-all active:scale-95"
          title="放大 (Ctrl+=)"
        >
          <Plus className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label="适合宽度"
          onClick={onFitWidth}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
            fitMode === 'width'
              ? 'bg-blue-50 text-blue-600 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="适合宽度 (Ctrl+1)"
        >
          <Maximize2 className="w-4 h-4" />
          <span className="sr-only">适合宽度</span>
        </button>

        {onFitPage && (
          <button
            type="button"
            aria-label="适合整页"
            onClick={onFitPage}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
              fitMode === 'page'
                ? 'bg-blue-50 text-blue-600 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]'
                : 'text-[#5f6672] hover:bg-slate-100'
            }`}
            title="适合整页 (Ctrl+2)"
          >
            <Fullscreen className="w-4 h-4" />
            <span className="sr-only">适合整页</span>
          </button>
        )}

        <button
          type="button"
          aria-label="旋转"
          onClick={onRotate}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5f6672] hover:bg-slate-100 transition-all active:scale-95"
          title="顺时针旋转 90° (Ctrl+R)"
        >
          <RotateCw className="w-4 h-4" />
          <span className="sr-only">旋转</span>
        </button>

        <button
          type="button"
          aria-label="查找"
          onClick={onToggleSearch}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
            isSearchOpen
              ? 'bg-blue-50 text-blue-600 font-medium shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="在文档中查找 (Ctrl+F)"
        >
          <Search className="w-4 h-4" />
          <span className="sr-only">查找</span>
        </button>
      </div>
    </div>
  );
}
