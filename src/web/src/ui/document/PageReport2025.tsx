import React from 'react';
import { FloatingBar } from './FloatingBar';
import { StickyNoteCard } from './StickyNoteCard';
import type { ToolType, AnnotationColor } from '../../types';
import { Sparkles } from 'lucide-react';

interface PageReport2025Props {
  currentTool?: ToolType;
  currentColor?: AnnotationColor;
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
  selectedElementId?: string;
}

export const PageReport2025: React.FC<PageReport2025Props> = ({
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
}) => {
  const selectedText =
    '第三季度受宏观经济环境影响，部分业务需求下降，导致营收环比下滑 8.7%。公司将积极调整策略，优化业务结构。';

  return (
    <div className="relative w-[720px] min-h-[960px] bg-white shadow-md rounded-sm p-12 text-[#1f2329] select-text font-sans mx-auto">
      {/* Document Header */}
      <div className="border-b-2 border-blue-600/30 pb-4 mb-6">
        <h1 className="text-[26px] font-bold text-[#0f172a] tracking-tight">
          2025 年度经营报告
        </h1>
        <p className="text-[13px] text-slate-500 mt-1 font-medium">
          —— 砥砺前行 · 聚力增长
        </p>
      </div>

      {/* Section 1: Overview */}
      <div className="mb-6">
        <h2 className="text-[16px] font-bold text-[#1e293b] mb-3 flex items-center">
          <span className="w-1.5 h-4 bg-blue-600 rounded-xs mr-2 inline-block" />
          一、总体经营情况
        </h2>

        <div className="text-[13.5px] leading-[1.8] text-slate-800 space-y-2">
          <p>
            2025 年，公司实现营业收入 128.6 亿元，
            {/* Highlighted snippet */}
            <span
              className={`px-1 py-0.5 rounded-xs transition-colors cursor-pointer ${
                showAnnotations ? 'bg-amber-200/80' : ''
              }`}
              title="标注：黄色彩笔高亮"
            >
              同比增长 6.8%。
            </span>
            {/* Note anchor pin */}
            {showAnnotations && (
              <span
                onClick={onToggleNoteCard}
                className="inline-flex items-center justify-center w-4 h-4 ml-1 bg-amber-500 text-white text-[10px] rounded-xs cursor-pointer hover:scale-110 shadow-xs"
                title="查看便签批注"
              >
                ✎
              </span>
            )}
          </p>

          <p>
            归母净利润 18.3 亿元，
            {/* Underline snippet */}
            <span
              className={`transition-all ${
                showAnnotations ? 'border-b-2 border-red-500 font-medium' : ''
              }`}
            >
              同比增长 12.1%。
            </span>
          </p>

          {/* Text Selection Area (Images 1, 2) */}
          <div className="relative inline-block my-1">
            <p
              onClick={onToggleSelectionBar}
              className={`p-1 rounded cursor-pointer transition-all ${
                showSelectionBar
                  ? 'bg-blue-100/90 text-blue-900 ring-1 ring-blue-300'
                  : 'hover:bg-slate-50'
              }`}
            >
              {selectedText}
            </p>

            {/* Floating Action Bar (Prototype 1 & 2) */}
            {showSelectionBar && (
              <FloatingBar
                position={{ x: 260, y: -8 }}
                onHighlight={onHighlightSelection}
                onUnderline={onUnderlineSelection}
                onAddNote={onToggleNoteCard}
                onCopy={() => navigator.clipboard.writeText(selectedText)}
                onAskAi={() => onAskAiWithSelection(selectedText)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="relative mb-7">
        <h3 className="text-[14px] font-bold text-[#1e293b] mb-4 flex items-center">
          <span className="w-1 h-3.5 bg-blue-600 rounded-xs mr-2 inline-block" />
          营业收入季度变化情况
        </h3>

        {/* Bar Chart Container */}
        <div
          className={`relative p-5 rounded-lg bg-slate-50/60 border transition-all ${
            showAnnotations || isRegionAskActive
              ? 'border-blue-400 bg-blue-50/10'
              : 'border-slate-200'
          }`}
        >
          {/* Chart Content */}
          <div className="flex items-end justify-between h-[180px] pt-6 pb-2 px-10 relative">
            {/* Grid horizontal lines */}
            <div className="absolute inset-x-8 inset-y-6 flex flex-col justify-between pointer-events-none opacity-40">
              <div className="border-b border-dashed border-slate-300 w-full" />
              <div className="border-b border-dashed border-slate-300 w-full" />
              <div className="border-b border-dashed border-slate-300 w-full" />
              <div className="border-b border-dashed border-slate-300 w-full" />
            </div>

            {/* Y-axis values */}
            <div className="absolute left-2 inset-y-6 flex flex-col justify-between text-[11px] text-slate-400 font-mono">
              <span>100</span>
              <span>75</span>
              <span>50</span>
              <span>25</span>
              <span>0</span>
            </div>

            {/* Q1 */}
            <div className="flex flex-col items-center z-10">
              <span className="text-[12px] font-medium text-slate-600 mb-1.5 font-mono">
                95.2
              </span>
              <div className="w-14 bg-blue-500 rounded-t-sm shadow-xs h-[105px] transition-all hover:bg-blue-600" />
              <span className="text-[12px] text-slate-600 mt-2 font-medium">第一季度</span>
            </div>

            {/* Q2 */}
            <div className="flex flex-col items-center z-10">
              <span className="text-[12px] font-medium text-slate-600 mb-1.5 font-mono">
                102.8
              </span>
              <div className="w-14 bg-blue-500 rounded-t-sm shadow-xs h-[118px] transition-all hover:bg-blue-600" />
              <span className="text-[12px] text-slate-600 mt-2 font-medium">第二季度</span>
            </div>

            {/* Q3 */}
            <div className="flex flex-col items-center z-10">
              <span className="text-[12px] font-medium text-slate-600 mb-1.5 font-mono">
                94.1
              </span>
              <div className="w-14 bg-blue-500 rounded-t-sm shadow-xs h-[100px] transition-all hover:bg-blue-600" />
              <span className="text-[12px] text-slate-600 mt-2 font-medium">第三季度</span>
            </div>

            {/* Q4 (With Annotations: red oval + blue arrow in Image 2) */}
            <div className="flex flex-col items-center z-10 relative">
              <div className="relative">
                <span className="text-[12px] font-bold text-slate-800 mb-1.5 font-mono block">
                  128.6
                </span>
                {/* Red oval callout (Image 2) */}
                {showChartAnnotations && (
                  <div className="absolute -inset-1 border-2 border-red-500 rounded-full pointer-events-none" />
                )}
                {/* Blue Arrow pointing to 128.6 (Image 2) */}
                {showChartAnnotations && (
                  <svg className="absolute -top-3 -right-8 w-8 h-8 text-blue-600 pointer-events-none">
                    <line x1="28" y1="2" x2="6" y2="18" stroke="currentColor" strokeWidth="2.5" />
                    <polygon points="4,22 12,18 8,10" fill="currentColor" />
                  </svg>
                )}
              </div>
              <div className="w-14 bg-blue-600 rounded-t-sm shadow-xs h-[145px] transition-all hover:bg-blue-700" />
              <span className="text-[12px] text-slate-800 mt-2 font-semibold">第四季度</span>
            </div>
          </div>

          {/* 8 Bounding Control Handles around chart (Image 2) */}
          {showChartAnnotations && (
            <div className="absolute inset-0 border-2 border-blue-500/80 pointer-events-none rounded-lg">
              <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />
              <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />
              <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />
              <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />
              <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />
              <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />
            </div>
          )}

          {/* Region Ask Overlay (Image 3) */}
          {isRegionAskActive && (
            <div className="absolute -inset-2 border-2 border-blue-600 border-dashed rounded-lg bg-blue-500/10 z-30 select-none">
              {/* Handles */}
              <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />
              <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />
              <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />
              <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs" />

              {/* Action Floating Pill (Image 3) */}
              <div className="absolute -bottom-10 right-0 bg-white border border-[#e3e6ea] rounded-xl shadow-lg px-2 py-1 flex items-center space-x-2">
                <button
                  onClick={onConfirmRegionAsk}
                  className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>问 AI</span>
                </button>
                <button
                  onClick={onCancelRegionAsk}
                  className="px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-100 text-[12px] transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Freetext note below chart (Image 2) */}
        {showChartAnnotations && (
          <div className="mt-3 flex justify-center">
            <span className="px-3 py-1 rounded-md border border-red-300 bg-red-50/70 text-red-600 text-[12px] font-medium tracking-wide">
              此处数据需核对
            </span>
          </div>
        )}
      </div>

      {/* Table Section: Main Financial Indicators */}
      <div>
        <h3 className="text-[14px] font-bold text-[#1e293b] mb-3 flex items-center">
          <span className="w-1 h-3.5 bg-blue-600 rounded-xs mr-2 inline-block" />
          主要财务指标
        </h3>

        <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">指标</th>
                <th className="py-2.5 px-4">2025 年</th>
                <th className="py-2.5 px-4">同比增长</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 text-slate-800">
              <tr className="hover:bg-slate-50/60">
                <td className="py-2.5 px-4 font-medium">营业收入 (亿元)</td>
                <td className="py-2.5 px-4 font-mono">128.6</td>
                <td className="py-2.5 px-4 font-mono text-green-600 font-medium">+6.8%</td>
              </tr>
              <tr className="hover:bg-slate-50/60">
                <td className="py-2.5 px-4 font-medium">归母净利润 (亿元)</td>
                <td className="py-2.5 px-4 font-mono">18.3</td>
                <td className="py-2.5 px-4 font-mono text-green-600 font-medium">+12.1%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky Note Popup Card (Image 2) */}
      {showNoteCard && (
        <StickyNoteCard
          author="张三"
          date="2025-11-14 20:45"
          content="需要补充行业数据和竞争对手情况"
          onUpdateContent={() => {}}
          onDelete={onToggleNoteCard}
          onClose={onToggleNoteCard}
          position={{ x: 440, y: 70 }}
        />
      )}
    </div>
  );
};
