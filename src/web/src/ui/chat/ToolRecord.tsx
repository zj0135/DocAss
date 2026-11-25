import React from 'react';
import type { ToolCallRecord } from '../../types';
import { Search, FileText, Scan, Loader2, Sparkles } from 'lucide-react';

interface ToolRecordProps {
  tool: ToolCallRecord;
}

export const ToolRecord: React.FC<ToolRecordProps> = ({ tool }) => {
  const renderIcon = () => {
    switch (tool.icon) {
      case 'search':
        return <Search className="w-3.5 h-3.5 text-slate-500" />;
      case 'document':
        return <FileText className="w-3.5 h-3.5 text-slate-500" />;
      case 'ocr':
        return <Scan className="w-3.5 h-3.5 text-blue-600" />;
      case 'image':
        return <Sparkles className="w-3.5 h-3.5 text-amber-500" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2 text-[12px] text-slate-600 space-y-1.5 shadow-2xs">
      <div className="flex items-center space-x-2">
        {tool.status === 'pending' ? (
          <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
        ) : (
          renderIcon()
        )}
        <span className="font-medium text-slate-700">{tool.text}</span>
      </div>

      {/* Progress Bar (Image 4) */}
      {tool.progress && (
        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
            style={{
              width: `${(tool.progress.current / tool.progress.total) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
};
