import React from 'react';
import { ExternalLink } from 'lucide-react';

interface CitationChipProps {
  page: number;
  label: string;
  onClick: (page: number) => void;
}

export const CitationChip: React.FC<CitationChipProps> = ({ page, label, onClick }) => {
  return (
    <button
      onClick={() => onClick(page)}
      className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-600 text-[11.5px] font-medium border border-blue-200/80 transition-colors mx-1 select-none cursor-pointer group"
      title={`点击跳转至文档第 ${page} 页`}
    >
      <span>{label}</span>
      <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
    </button>
  );
};
