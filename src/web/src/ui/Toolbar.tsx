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
  Sliders,
} from 'lucide-react';

interface ToolbarProps {
  currentTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  currentColor: AnnotationColor;
  onSelectColor: (color: AnnotationColor) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
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
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  onSelectTool,
  currentColor,
  onSelectColor,
  strokeWidth,
  onStrokeWidthChange,
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
}) => {
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

  // Close popovers on click outside
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

  return (
    <div className="h-[44px] bg-white border-b border-[#e3e6ea] px-3 flex items-center justify-between select-none relative z-20 flex-shrink-0">
      {/* Left: Tools Group */}
      <div className="flex items-center space-x-1">
        {/* Select Tool */}
        <button
          onClick={() => onSelectTool('select')}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'select'
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="选择工具 (V)"
        >
          <MousePointer2 className="w-4 h-4" />
        </button>

        {/* Highlight */}
        <button
          onClick={() => onSelectTool('highlight')}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'highlight'
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="文字高亮 (H)"
        >
          <Highlighter className="w-4 h-4" />
        </button>

        {/* Underline */}
        <button
          onClick={() => onSelectTool('underline')}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'underline'
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="文字下划线 (U)"
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>

        {/* Sticky Note */}
        <button
          onClick={() => onSelectTool('note')}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'note'
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="便签 (N)"
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        {/* Text Annotation / Freetext */}
        <button
          onClick={() => onSelectTool('freetext')}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'freetext'
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="文字批注 (T)"
        >
          <Type className="w-4 h-4" />
        </button>

        {/* Pen / Ink */}
        <button
          onClick={() => onSelectTool('ink')}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'ink'
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="画笔 (P)"
        >
          <PenLine className="w-4 h-4" />
        </button>

        {/* Rect */}
        <button
          onClick={() => onSelectTool('rect')}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'rect'
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="矩形 (R)"
        >
          <SquareIcon className="w-4 h-4" />
        </button>

        {/* Arrow */}
        <button
          onClick={() => onSelectTool('arrow')}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'arrow'
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="箭头 (A)"
        >
          <ArrowUpRight className="w-4 h-4" />
        </button>

        {/* Region Ask */}
        <button
          onClick={() => onSelectTool('regionAsk')}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'regionAsk'
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="框选提问 (Q)"
        >
          <Scan className="w-4 h-4" />
        </button>

        {/* Eraser */}
        <button
          onClick={() => onSelectTool('eraser')}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'eraser'
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="橡皮擦 (E)"
        >
          <Eraser className="w-4 h-4" />
        </button>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-[#e3e6ea] mx-2" />

        {/* Color Palette & Stroke Width Popover Trigger */}
        <div className="relative" ref={colorPopoverRef}>
          <div
            onClick={() => setShowColorPopover(!showColorPopover)}
            className="flex items-center space-x-1.5 px-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            title="颜色与线宽设置"
          >
            <div className="flex items-center space-x-1.5">
              {colors.map((c) => (
                <button
                  key={c.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectColor(c.value);
                  }}
                  style={{ backgroundColor: c.value }}
                  className={`w-4 h-4 rounded-full transition-transform ${
                    currentColor === c.value
                      ? 'scale-125 ring-2 ring-offset-1 ring-blue-500'
                      : 'hover:scale-110 opacity-90'
                  }`}
                  title={c.label}
                />
              ))}
            </div>
            <Sliders className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </div>

          {/* Color & Stroke Width Popover (as shown in image 2) */}
          {showColorPopover && (
            <div className="absolute top-10 left-0 bg-white border border-[#e3e6ea] rounded-xl shadow-lg p-3.5 w-64 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="text-[12px] font-medium text-[#5f6672] mb-2">标注颜色</div>
              <div className="flex items-center justify-between mb-4">
                {colors.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => onSelectColor(c.value)}
                    style={{ backgroundColor: c.value }}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      currentColor === c.value ? 'ring-2 ring-offset-2 ring-blue-600 scale-110' : 'hover:scale-105'
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
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-[1px] h-5 bg-[#e3e6ea] mx-2" />

        {/* History: Undo / Redo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            canUndo ? 'text-[#5f6672] hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'
          }`}
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            canRedo ? 'text-[#5f6672] hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'
          }`}
          title="重做 (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Zoom & View Controls */}
      <div className="flex items-center space-x-1.5">
        {/* Zoom Out */}
        <button
          onClick={() => onScaleChange(Math.max(0.5, scale - 0.25))}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5f6672] hover:bg-slate-100 transition-colors"
          title="缩小 (Ctrl+-)"
        >
          <Minus className="w-4 h-4" />
        </button>

        {/* Scale Percentage Dropdown */}
        <div className="relative" ref={scaleDropdownRef}>
          <button
            onClick={() => setShowScaleDropdown(!showScaleDropdown)}
            className="flex items-center space-x-1 px-2.5 h-8 rounded-lg text-[13px] font-medium text-[#1f2329] hover:bg-slate-100 transition-colors"
          >
            <span>{Math.round(scale * 100)}%</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showScaleDropdown && (
            <div className="absolute top-10 right-0 bg-white border border-[#e3e6ea] rounded-xl shadow-lg py-1.5 w-32 z-50 text-[13px]">
              {scalePresets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    onScaleChange(preset.value);
                    setShowScaleDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 flex items-center justify-between ${
                    Math.round(scale * 100) === Math.round(preset.value * 100)
                      ? 'text-blue-600 font-medium bg-blue-50/50'
                      : 'text-[#1f2329]'
                  }`}
                >
                  <span>{preset.label}</span>
                </button>
              ))}
              <div className="border-t border-[#e3e6ea] my-1" />
              <button
                onClick={() => {
                  onFitWidth();
                  setShowScaleDropdown(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-[#1f2329]"
              >
                适合宽度
              </button>
            </div>
          )}
        </div>

        {/* Zoom In */}
        <button
          onClick={() => onScaleChange(Math.min(3.0, scale + 0.25))}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5f6672] hover:bg-slate-100 transition-colors"
          title="放大 (Ctrl+=)"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Fit Width */}
        <button
          onClick={onFitWidth}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5f6672] hover:bg-slate-100 transition-colors"
          title="适合宽度 (Ctrl+1)"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        {/* Rotate */}
        <button
          onClick={onRotate}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5f6672] hover:bg-slate-100 transition-colors"
          title="顺时针旋转 90° (Ctrl+R)"
        >
          <RotateCw className="w-4 h-4" />
        </button>

        {/* Search */}
        <button
          onClick={onToggleSearch}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            isSearchOpen
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-[#5f6672] hover:bg-slate-100'
          }`}
          title="在文档中查找 (Ctrl+F)"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
