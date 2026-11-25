import React, { useState } from 'react';
import type { AppSettings, ModelProvider } from '../../types';
import {
  X,
  Cpu,
  Layers,
  Sparkles,
  Info,
  Check,
  Loader2,
  FolderOpen,
  Plus,
  Play,
  Lock,
} from 'lucide-react';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'annot' | 'ocr' | 'about'>('providers');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('deepseek');
  const [providers, setProviders] = useState<ModelProvider[]>(settings.providers);
  const [annotConfig, setAnnotConfig] = useState(settings.annotation);
  const [ocrConfig, setOcrConfig] = useState(settings.ocr);

  // Test connection state
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  if (!isOpen) return null;

  const currentProvider =
    providers.find((p) => p.id === selectedProviderId) || providers[0];

  const handleUpdateCurrentProvider = (fields: Partial<ModelProvider>) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === currentProvider.id ? { ...p, ...fields } : p))
    );
  };

  const handleTestConnection = () => {
    setTestState('testing');
    setTimeout(() => {
      setTestState('success');
    }, 1200);
  };

  const handleSave = () => {
    onSaveSettings({
      ...settings,
      providers,
      annotation: annotConfig,
      ocr: ocrConfig,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      {/* Modal Dialog (900x620) */}
      <div className="w-[880px] h-[640px] max-h-[92vh] bg-white rounded-2xl shadow-modal border border-[#e3e6ea] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-[52px] px-6 border-b border-[#e3e6ea] flex items-center justify-between flex-shrink-0">
          <span className="text-[16px] font-bold text-[#1f2329]">设置</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Left Nav + Right Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation (180px) */}
          <div className="w-[180px] bg-[#f8fafc] border-r border-[#e3e6ea] p-3 space-y-1 flex-shrink-0">
            <button
              onClick={() => setActiveTab('providers')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                activeTab === 'providers'
                  ? 'bg-blue-50 text-blue-600 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>模型提供方</span>
            </button>

            <button
              onClick={() => setActiveTab('annot')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                activeTab === 'annot'
                  ? 'bg-blue-50 text-blue-600 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Layers className="w-4 h-4 text-slate-600" />
              <span>标注设置</span>
            </button>

            <button
              onClick={() => setActiveTab('ocr')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                activeTab === 'ocr'
                  ? 'bg-blue-50 text-blue-600 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Cpu className="w-4 h-4 text-slate-600" />
              <span>文字识别</span>
            </button>

            <button
              onClick={() => setActiveTab('about')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                activeTab === 'about'
                  ? 'bg-blue-50 text-blue-600 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Info className="w-4 h-4 text-slate-600" />
              <span>关于</span>
            </button>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-white text-left">
            {/* TAB 1: MODEL PROVIDERS (Image 5) */}
            {activeTab === 'providers' && (
              <div className="space-y-3.5 max-w-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-bold text-slate-900">模型提供方</h3>
                  <button
                    onClick={() => {}}
                    className="flex items-center space-x-1 text-[12px] text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加提供方</span>
                  </button>
                </div>

                {/* Provider Cards List (Image 5) */}
                <div className="space-y-1.5">
                  {providers.map((p) => {
                    const isSelected = p.id === currentProvider.id;

                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedProviderId(p.id);
                          setTestState('idle');
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/20 ring-1 ring-blue-500'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[12.5px]">
                            {p.name.charAt(0)}
                          </div>
                          <div>
                            <div className="text-[12.5px] font-semibold text-slate-800">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {p.baseUrl}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-green-50 text-green-700 border border-green-200">
                            <Check className="w-3 h-3" />
                            <span>已配置密钥</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Provider Form (Image 5) */}
                <div className="pt-2 border-t border-slate-100 space-y-2.5 text-[12.5px]">
                  <div>
                    <label className="block text-[11.5px] font-medium text-slate-600 mb-0.5">
                      名称
                    </label>
                    <input
                      type="text"
                      value={currentProvider.name}
                      onChange={(e) => handleUpdateCurrentProvider({ name: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:border-blue-500 text-[12.5px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11.5px] font-medium text-slate-600 mb-0.5">
                      接口地址
                    </label>
                    <input
                      type="text"
                      value={currentProvider.baseUrl}
                      onChange={(e) => handleUpdateCurrentProvider({ baseUrl: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-800 font-mono focus:outline-hidden focus:border-blue-500 text-[12px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11.5px] font-medium text-slate-600 mb-0.5">
                      API Key
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="password"
                        value=""
                        placeholder="演示不包含密钥"
                        readOnly
                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 bg-slate-50 focus:outline-hidden font-mono tracking-wider text-[12px]"
                      />
                      <button className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-700 font-medium text-[11.5px]">
                        更换
                      </button>
                    </div>
                    <p className="text-[10.5px] text-slate-400 mt-0.5 flex items-center space-x-1">
                      <Lock className="w-3 h-3 text-slate-400 inline" />
                      <span>密钥加密保存在本机，仅由应用后台使用</span>
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11.5px] font-medium text-slate-600 mb-0.5">
                      模型
                    </label>
                    <select
                      value={currentProvider.selectedModel}
                      onChange={(e) => handleUpdateCurrentProvider({ selectedModel: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:border-blue-500 bg-white text-[12.5px]"
                    >
                      {currentProvider.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Toggle: Support Vision (Image 5) */}
                  <div className="flex items-center justify-between py-0.5">
                    <div>
                      <div className="text-[12px] font-medium text-slate-700">
                        支持图像输入
                      </div>
                      <div className="text-[10.5px] text-slate-400">
                        开启后框选区域提问将同时发送截图附件
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleUpdateCurrentProvider({
                          supportsVision: !currentProvider.supportsVision,
                        })
                      }
                      className={`w-10 h-5.5 flex items-center rounded-full p-0.5 transition-colors ${
                        currentProvider.supportsVision ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    >
                      <div
                        className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform ${
                          currentProvider.supportsVision ? 'translate-x-4.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Tab Footer (Image 5) */}
                <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleTestConnection}
                      disabled={testState === 'testing'}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-[12.5px] transition-colors"
                    >
                      {testState === 'testing' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 fill-current text-blue-600" />
                      )}
                      <span>测试连接</span>
                    </button>

                    {testState === 'success' && (
                      <span className="flex items-center space-x-1 text-green-600 font-medium text-[12px] animate-in fade-in">
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span>连接成功</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={onClose}
                      className="px-4 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-[13px] font-medium"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium shadow-xs"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ANNOTATION SETTINGS */}
            {activeTab === 'annot' && (
              <div className="space-y-5 max-w-lg">
                <h3 className="text-[15px] font-bold text-slate-900">标注配置</h3>
                <div className="space-y-4 text-[13px]">
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 mb-1">
                      标注作者名
                    </label>
                    <input
                      type="text"
                      value={annotConfig.author}
                      onChange={(e) =>
                        setAnnotConfig({ ...annotConfig, author: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-800"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      默认取自当前 Windows 系统用户名
                    </p>
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 mb-1">
                      默认高亮不透明度 ({Math.round(annotConfig.defaultOpacity * 100)}%)
                    </label>
                    <input
                      type="range"
                      min="0.2"
                      max="1.0"
                      step="0.05"
                      value={annotConfig.defaultOpacity}
                      onChange={(e) =>
                        setAnnotConfig({
                          ...annotConfig,
                          defaultOpacity: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-t border-slate-100">
                    <div>
                      <div className="font-medium text-slate-700">自动浮出操作条</div>
                      <div className="text-[11px] text-slate-400">
                        在文档中选中文字后，自动在其上方显示快速高亮和问 AI 操作条
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={annotConfig.autoShowFloatingBar}
                      onChange={(e) =>
                        setAnnotConfig({
                          ...annotConfig,
                          autoShowFloatingBar: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-blue-600 rounded"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-[13px]"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium shadow-xs"
                  >
                    保存
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: OCR SETTINGS */}
            {activeTab === 'ocr' && (
              <div className="space-y-5 max-w-lg">
                <h3 className="text-[15px] font-bold text-slate-900">文字识别引擎</h3>
                <div className="space-y-4 text-[13px]">
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 mb-2">
                      模型档位
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'tiny', label: 'Tiny (轻量)', desc: '速度极快，内存低' },
                        { id: 'small', label: 'Small (推荐)', desc: '均衡精准，标准模型' },
                        { id: 'medium', label: 'Medium (高精)', desc: '高精度，适合复杂版面' },
                      ].map((tier) => (
                        <div
                          key={tier.id}
                          onClick={() => setOcrConfig({ ...ocrConfig, tier: tier.id as any })}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            ocrConfig.tier === tier.id
                              ? 'border-blue-500 bg-blue-50/20 ring-1 ring-blue-500'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="font-semibold text-slate-800 text-[12.5px]">
                            {tier.label}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">{tier.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 border-t border-slate-100">
                    <div>
                      <div className="font-medium text-slate-700">启用 GPU 加速 (Vulkan)</div>
                      <div className="text-[11px] text-slate-400">
                        检测到 GPU: NVIDIA GeForce RTX 4070 (Vulkan 1.3 支持)
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setOcrConfig({ ...ocrConfig, enableGpu: !ocrConfig.enableGpu })
                      }
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                        ocrConfig.enableGpu ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          ocrConfig.enableGpu ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-700">本地识别缓存</div>
                        <div className="text-[11px] text-slate-400">
                          已缓存 {ocrConfig.cachedPages} 个文档页面 (约 18.6 MB)
                        </div>
                      </div>
                      <button
                        onClick={() => setOcrConfig({ ...ocrConfig, cachedPages: 0 })}
                        className="px-3 py-1 text-[12px] border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
                      >
                        清空缓存
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end space-x-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-[13px]"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium shadow-xs"
                  >
                    保存
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: ABOUT */}
            {activeTab === 'about' && (
              <div className="space-y-6 max-w-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-[18px] font-bold text-slate-900">
                      DocAss 文档助手
                    </h3>
                    <p className="text-[12px] text-slate-400 font-mono">
                      v0.2.0-preview (build 20261116)
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-[12.5px] space-y-2 text-slate-600">
                  <p className="font-semibold text-slate-800">运行时环境：</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1 font-mono text-[12px]">
                    <li>Host: .NET 11.0.100 (win-x64)</li>
                    <li>Shell: WPF + Microsoft Edge WebView2 (124.0.2478.80)</li>
                    <li>Frontend: React 19 + TypeScript + Vite 8</li>
                    <li>OCR Engine: SimdPaddleOCR (PaddleOCR v4)</li>
                  </ul>
                </div>

                <div className="text-[12px] text-slate-500 space-y-1">
                  <p className="font-medium text-slate-700">开源协议与鸣谢：</p>
                  <p>PDF.js (Apache-2.0), Lucide Icons (ISC), Tailwind CSS (MIT)</p>
                </div>

                <div className="pt-2">
                  <button className="flex items-center space-x-1.5 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-[12.5px] text-slate-700 font-medium">
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>打开运行日志目录</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
