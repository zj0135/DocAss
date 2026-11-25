import React, { useState } from 'react';
import { Eye, ChevronLeft, Sparkles } from 'lucide-react';

export interface PrototypeScene {
  id: number;
  title: string;
  desc: string;
}

interface PrototypeSceneSelectorProps {
  currentScene: number;
  onSelectScene: (sceneId: number) => void;
}

export const PrototypeSceneSelector: React.FC<PrototypeSceneSelectorProps> = ({
  currentScene,
  onSelectScene,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const scenes: PrototypeScene[] = [
    {
      id: 1,
      title: '原型 1：主界面概览',
      desc: '文字选择浮条、问AI、对话分析与引用跳转',
    },
    {
      id: 2,
      title: '原型 2：标注与便签',
      desc: '标注列表、颜色/线宽面板、便签卡片、自动保存',
    },
    {
      id: 3,
      title: '原型 3：框选提问',
      desc: '区域选框、截图附件卡片、流式回答与停止',
    },
    {
      id: 4,
      title: '原型 4：扫描件与OCR',
      desc: '扫描合同、查找条、OCR识别进度与未识别提示',
    },
    {
      id: 5,
      title: '原型 5：设置与模型',
      desc: '模型提供方管理、API Key、图像输入与连接测试',
    },
  ];

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="fixed bottom-10 left-3 z-50 bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-full shadow-lg flex items-center space-x-1.5 transition-all text-[12px] font-medium select-none"
        title="展开原型预设切换器"
      >
        <Eye className="w-4 h-4" />
        <span>原型预设 (1-5)</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-10 left-3 z-50 bg-white/95 backdrop-blur-md border border-[#e3e6ea] rounded-2xl shadow-xl p-3 w-[300px] select-none text-left animate-in slide-in-from-bottom-3 duration-200">
      <div className="flex items-center justify-between pb-2 border-b border-slate-150 mb-2">
        <div className="flex items-center space-x-1.5 text-blue-600 font-semibold text-[13px]">
          <Sparkles className="w-4 h-4" />
          <span>原型图场景快速切换</span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title="收起"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        {scenes.map((s) => {
          const isActive = s.id === currentScene;
          return (
            <div
              key={s.id}
              onClick={() => onSelectScene(s.id)}
              className={`p-2 rounded-xl cursor-pointer text-[12px] transition-all flex items-start space-x-2 ${
                isActive
                  ? 'bg-blue-50 text-blue-900 border border-blue-200 font-medium shadow-2xs'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                  isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {s.id}
              </div>
              <div className="flex-1 truncate">
                <div className="font-semibold">{s.title}</div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                  {s.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
