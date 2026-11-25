import React from 'react';
import { CheckCircle2, Clock, Users, Calendar } from 'lucide-react';

export const PageMeetingMinutes: React.FC = () => {
  return (
    <div className="relative w-[720px] min-h-[960px] bg-white shadow-md rounded-sm p-12 text-[#1f2329] font-sans border border-slate-200 mx-auto select-text">
      {/* Header */}
      <div className="border-b-2 border-slate-800 pb-4 mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[24px] font-bold text-[#0f172a]">
            产品与研发周例会纪要
          </h1>
          <span className="text-[11px] px-2.5 py-1 bg-blue-50 text-blue-700 font-mono font-medium rounded-full">
            DOC-2025-11-W2
          </span>
        </div>
        <div className="flex items-center space-x-6 text-[12.5px] text-slate-500 mt-3">
          <div className="flex items-center space-x-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>2025年11月14日 14:00 - 15:30</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>参会人员：张三、李四、王五、赵六</span>
          </div>
        </div>
      </div>

      {/* Main Sections */}
      <div className="space-y-6 text-[13.5px] leading-relaxed text-slate-700">
        <div>
          <h3 className="text-[15px] font-bold text-slate-900 mb-2 flex items-center">
            <Clock className="w-4 h-4 text-blue-600 mr-2" />
            一、上周工作回顾与进展
          </h3>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>桌面文档助手 DocAss v0.2 原型与设计文档评审通过。</li>
            <li>前端完成基于 Vite + React + TypeScript 架构搭建与轻量级无边框窗口布局。</li>
            <li>SimdPaddleOCR 中文识别模型在本地完成基准性能验证。</li>
          </ul>
        </div>

        <div>
          <h3 className="text-[15px] font-bold text-slate-900 mb-2 flex items-center">
            <CheckCircle2 className="w-4 h-4 text-green-600 mr-2" />
            二、关键决议与战略共识
          </h3>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
            <p className="font-medium text-slate-800">
              1. 标注系统与原始文件完全解耦：标注采用本地 JSON 独立存储，绝对不篡改原 PDF。
            </p>
            <p className="font-medium text-slate-800">
              2. LLM 与文档交互严格遵循上下文预算与按需读取机制，保护用户数据隐私。
            </p>
            <p className="font-medium text-slate-800">
              3. 界面视觉遵循统一规范，保证 1366×768 到高分辨率多屏缩放无瑕疵呈现。
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-[15px] font-bold text-slate-900 mb-2">
            三、下周重点待办（Action Items）
          </h3>
          <table className="w-full text-left text-[12.5px] border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-100 font-semibold text-slate-700">
              <tr>
                <th className="py-2 px-3">事项</th>
                <th className="py-2 px-3">责任人</th>
                <th className="py-2 px-3">截止日期</th>
                <th className="py-2 px-3">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="py-2 px-3">完成前端原型交互验证与走查</td>
                <td className="py-2 px-3">张三</td>
                <td className="py-2 px-3 font-mono">11-18</td>
                <td className="py-2 px-3 text-amber-600 font-medium">进行中</td>
              </tr>
              <tr>
                <td className="py-2 px-3">完成 WPF + WebView2 桥端点联调</td>
                <td className="py-2 px-3">李四</td>
                <td className="py-2 px-3 font-mono">11-20</td>
                <td className="py-2 px-3 text-slate-500">未开始</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
