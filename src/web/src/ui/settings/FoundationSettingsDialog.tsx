import { useEffect, useState, useRef } from 'react';
import {
  X,
  Settings as SettingsIcon,
  Lock,
  Sparkles,
  Layers,
  Cpu,
  Info,
  Plus,
  Check,
  Play,
  Loader2,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import type { Settings, Provider } from '../../contracts';
import type { AppServices } from '../../services/AppServices';
import { CustomSelect } from '../primitives/CustomSelect';
import { CustomSwitch, CustomColorSwatch } from '../primitives/CustomControls';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { ToastBanner } from '../primitives/ToastBanner';

type TabKey = 'providers' | 'annot' | 'ocr' | 'about';

export function FoundationSettingsDialog({
  services,
  initial,
  onSaved,
  onClose,
}: {
  services: AppServices;
  initial: Settings;
  onSaved: (settings: Settings) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('providers');
  const [draft, setDraft] = useState(initial);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [cacheStatus, setCacheStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmDeleteProvider, setConfirmDeleteProvider] = useState(false);

  const provider = providers.find((p) => p.id === selected);
  const [about, setAbout] = useState<{ version: string; runtime: string; licenses: string[] }>();

  useEffect(() => {
    void services.diagnostics
      .info()
      .then(setAbout)
      .catch((e) => setError(String(e)));
  }, [services]);

  const original = useRef('');
  const originalProviders = useRef('');
  const test = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; text: string } | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void Promise.all([services.providers.list(), services.settings.get()])
      .then(([list, settings]) => {
        if (active) {
          setProviders(list);
          setSelected(list[0]?.id ?? '');
          setDraft(settings);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [services]);

  useEffect(() => {
    if (loaded && !original.current) {
      original.current = JSON.stringify(draft);
      originalProviders.current = JSON.stringify(providers);
    }
  }, [loaded, draft, providers]);

  useEffect(() => () => test.current?.abort(), []);

  const close = (saved = false) => {
    if (
      !saved &&
      (key ||
        Object.values(keys).some(Boolean) ||
        original.current !== JSON.stringify(draft) ||
        originalProviders.current !== JSON.stringify(providers)) &&
      !window.confirm('设置尚未保存，确定放弃修改？')
    ) {
      return;
    }
    test.current?.abort();
    setKey('');
    setKeys({});
    onClose();
  };

  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing && !confirmDeleteProvider) {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  });

  const update = (fields: Partial<Provider>) =>
    setProviders((list) => list.map((p) => (p.id === selected ? { ...p, ...fields } : p)));

  const selectProvider = (id: string) => {
    setKeys({ ...keys, [selected]: key });
    setSelected(id);
    setKey(keys[id] ?? '');
    setTestResult(null);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      for (const p of providers) {
        await services.providers.save(p, (p.id === selected ? key : keys[p.id]) || undefined);
      }
      const saved = await services.settings.update(draft);
      setKey('');
      setKeys({});
      onSaved(saved);
      close(true);
    } catch (e) {
      setKey('');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    setKeys({ ...keys, [selected]: key });
    const id = crypto.randomUUID();
    setProviders((list) => [
      ...list,
      {
        id,
        name: '新提供方',
        api: 'openai-completions',
        baseUrl: 'https://api.openai.com/v1',
        isDefault: list.length === 0,
        imageAllowed: false,
        models: [],
        hasKey: false,
      },
    ]);
    setSelected(id);
    setKey('');
  };

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const navItems: { id: TabKey; label: string; sub: string; icon: React.ReactNode }[] = [
    { id: 'providers', label: '模型提供方', sub: 'API & 模型', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'annot', label: '标注设置', sub: '作者与外观', icon: <Layers className="w-4 h-4" /> },
    { id: 'ocr', label: '文字识别', sub: '引擎与缓存', icon: <Cpu className="w-4 h-4" /> },
    { id: 'about', label: '关于', sub: '版本与许可', icon: <Info className="w-4 h-4" /> },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4 select-none"
    >
      <div className="animate-surface-in bg-white rounded-2xl shadow-[0_24px_64px_-16px_rgba(15,23,42,0.28)] w-[900px] h-[650px] max-w-full max-h-[92vh] border border-slate-200/90 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-[56px] px-6 border-b border-[#e3e6ea] flex justify-between items-center shrink-0 bg-white/95 backdrop-blur-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[15.5px] font-bold text-[#1f2329] tracking-tight leading-none">设置</h2>
              <p className="text-[11px] text-slate-400 mt-1 leading-none">偏好配置、模型接口与本地识别</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭设置"
            onClick={() => close()}
            disabled={busy}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Compact Mobile/Narrow Horizontal Tab Strip (<640px) */}
        <div className="sm:hidden flex items-center gap-1 px-3 py-2 bg-[#f8fafc] border-b border-[#e3e6ea] overflow-x-auto no-scrollbar shrink-0">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  active ? 'bg-white text-blue-600 shadow-2xs ring-1 ring-slate-200' : 'text-slate-600'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body: Left Nav + Right Active Tab Panel */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Left Navigation (200px) */}
          <nav className="w-[200px] bg-[#f8fafc] border-r border-[#e3e6ea] p-3 space-y-1 shrink-0 hidden sm:flex flex-col">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchTab(item.id)}
                  className={`relative w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                    active
                      ? 'bg-white text-blue-600 shadow-xs ring-1 ring-slate-200/80'
                      : 'text-slate-600 hover:bg-slate-200/50'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-blue-600" />
                  )}
                  <span className={active ? 'text-blue-600' : 'text-slate-400'}>{item.icon}</span>
                  <div className="min-w-0">
                    <div className={`text-[13px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
                      {item.label}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5 leading-tight">{item.sub}</div>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Right Content Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 bg-white text-left">
            {error && (
              <div ref={errorRef} className="mb-4">
                <ToastBanner tone="error" role="alert" onClose={() => setError('')}>
                  {error}
                </ToastBanner>
              </div>
            )}

            {/* TAB 1: MODEL PROVIDERS */}
            {activeTab === 'providers' && (
              <section key="providers" className="animate-float-in space-y-4 max-w-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10.5px] font-semibold uppercase tracking-widest text-blue-600">
                      Providers
                    </span>
                    <h3 className="text-[16px] font-bold text-slate-900 tracking-tight">模型提供方</h3>
                  </div>
                  <button
                    type="button"
                    disabled={!loaded || busy}
                    onClick={add}
                    className="inline-flex items-center space-x-1.5 text-[12.5px] text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-xl bg-blue-50/70 hover:bg-blue-100/70 transition-colors disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加提供方</span>
                  </button>
                </div>

                {providers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-[13px] text-slate-500">
                    尚未配置模型提供方，点击右上角「添加提供方」开始配置。
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {providers.map((p) => {
                        const isSelected = p.id === selected;
                        return (
                          <div
                            key={p.id}
                            onClick={() => selectProvider(p.id)}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50/25 ring-1 ring-blue-500/40 shadow-2xs'
                                : 'border-slate-200/90 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-[13px] shrink-0 ${
                                  isSelected ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-600'
                                }`}
                              >
                                {(p.name || 'P').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[13px] font-semibold text-slate-800 truncate flex items-center gap-2">
                                  <span>{p.name || '未命名提供方'}</span>
                                  {p.isDefault && (
                                    <span className="px-1.5 py-0.5 text-[10px] rounded-md bg-blue-50 text-blue-600 font-medium border border-blue-200/70">
                                      默认
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono truncate">{p.baseUrl}</div>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 shrink-0 ml-2">
                              {p.hasKey ? (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Check className="w-3 h-3" />
                                  <span>已配置密钥</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                  未配置密钥
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <select
                      aria-label="提供方"
                      className="sr-only"
                      value={selected}
                      onChange={(e) => selectProvider(e.target.value)}
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.hasKey ? '（已保存密钥）' : ''}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                {provider && (
                  <div className="pt-4 border-t border-slate-100 space-y-3.5 text-[12.5px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <label className="block">
                        <span className="block text-[11.5px] font-medium text-slate-600 mb-1">名称</span>
                        <input
                          aria-label="提供方名称"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 text-[12.5px] transition-all"
                          value={provider.name}
                          onChange={(e) => update({ name: e.target.value })}
                        />
                      </label>

                      <div>
                        <span className="block text-[11.5px] font-medium text-slate-600 mb-1">API 类型</span>
                        <CustomSelect
                          ariaLabel="API 类型"
                          value={provider.api}
                          onChange={(v) => update({ api: v as Provider['api'] })}
                          className="w-full"
                          options={[
                            {
                              value: 'openai-completions',
                              label: 'openai-completions',
                              description: 'OpenAI Chat Completions 兼容',
                            },
                            { value: 'openai-responses', label: 'openai-responses', description: 'OpenAI Responses API' },
                            {
                              value: 'anthropic-messages',
                              label: 'anthropic-messages',
                              description: 'Anthropic Messages API',
                            },
                            {
                              value: 'google-generative-ai',
                              label: 'google-generative-ai',
                              description: 'Google Gemini API',
                            },
                          ]}
                        />
                      </div>
                    </div>

                    <label className="block">
                      <span className="block text-[11.5px] font-medium text-slate-600 mb-1">接口地址</span>
                      <input
                        aria-label="接口地址"
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 text-[12px] transition-all"
                        value={provider.baseUrl}
                        onChange={(e) => update({ baseUrl: e.target.value })}
                      />
                    </label>

                    <div>
                      <label className="block">
                        <span className="block text-[11.5px] font-medium text-slate-600 mb-1">
                          {provider.hasKey ? '更换密钥（留空保留）' : 'API Key'}
                        </span>
                        <input
                          aria-label="API Key"
                          type="password"
                          autoComplete="new-password"
                          placeholder={provider.hasKey ? '••••••••••••••••••••（留空保留原密钥）' : ''}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 bg-white focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 font-mono text-[12px] disabled:bg-slate-50 transition-all"
                          value={key}
                          disabled={!services.capabilities.credentials}
                          onChange={(e) => setKey(e.target.value)}
                        />
                      </label>
                      <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                        <Lock className="w-3 h-3 shrink-0" />
                        <span>
                          {services.capabilities.credentials
                            ? '密钥仅加密保存在当前 Windows 用户账户中，仅由应用后台使用。'
                            : '浏览器模式不保存密钥，请使用桌面应用。'}
                        </span>
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 space-y-3">
                      <label className="flex items-center justify-between cursor-pointer">
                        <div>
                          <div className="text-[12.5px] font-medium text-slate-700">允许图像输入</div>
                          <div className="text-[11px] text-slate-400">
                            图像还需开启对应模型的视觉能力。设置更改从下一次发送生效。
                          </div>
                        </div>
                        <CustomSwitch
                          ariaLabel="允许图像输入"
                          checked={provider.imageAllowed}
                          onChange={(v) => update({ imageAllowed: v })}
                        />
                      </label>

                      <div className="border-t border-slate-200/70 pt-2.5">
                        <label className="flex items-center justify-between cursor-pointer">
                          <span className="text-[12.5px] font-medium text-slate-700">设为默认提供方</span>
                          <CustomSwitch
                            ariaLabel="默认提供方"
                            checked={provider.isDefault}
                            onChange={(v) =>
                              setProviders((list) =>
                                list.map((p) => ({ ...p, isDefault: p.id === selected && v }))
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>

                    <fieldset className="border border-slate-200 rounded-xl p-3.5 space-y-3 bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <legend className="text-[12.5px] font-semibold text-slate-800 px-1">模型列表</legend>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700 font-medium px-2 py-0.5 rounded-lg hover:bg-blue-50 transition-colors"
                          onClick={() =>
                            update({
                              models: [
                                ...provider.models,
                                { modelId: '', input: ['text'], contextWindow: 32768, maxOutputTokens: 2048 },
                              ],
                            })
                          }
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>添加模型</span>
                        </button>
                      </div>

                      {provider.models.map((model, index) => (
                        <div key={index} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 shadow-2xs">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <label className="block sm:col-span-1">
                              <span className="block text-[11px] text-slate-500 mb-0.5">模型 ID</span>
                              <input
                                aria-label={`模型 ID ${index + 1}`}
                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[12px] focus:outline-hidden focus:border-blue-500"
                                value={model.modelId}
                                onChange={(e) =>
                                  update({
                                    models: provider.models.map((m, i) =>
                                      i === index ? { ...m, modelId: e.target.value } : m
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="block text-[11px] text-slate-500 mb-0.5">上下文窗口</span>
                              <input
                                aria-label={`上下文窗口 ${index + 1}`}
                                type="number"
                                min={1024}
                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[12px] focus:outline-hidden focus:border-blue-500"
                                value={model.contextWindow}
                                onChange={(e) =>
                                  update({
                                    models: provider.models.map((m, i) =>
                                      i === index ? { ...m, contextWindow: Number(e.target.value) } : m
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="block text-[11px] text-slate-500 mb-0.5">输出预留</span>
                              <input
                                aria-label={`输出预留 ${index + 1}`}
                                type="number"
                                min={1}
                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[12px] focus:outline-hidden focus:border-blue-500"
                                value={model.maxOutputTokens}
                                onChange={(e) =>
                                  update({
                                    models: provider.models.map((m, i) =>
                                      i === index ? { ...m, maxOutputTokens: Number(e.target.value) } : m
                                    ),
                                  })
                                }
                              />
                            </label>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2 text-[12px] text-slate-700 cursor-pointer">
                                <CustomSwitch
                                  ariaLabel={`模型视觉 ${index + 1}`}
                                  checked={model.input.includes('image')}
                                  onChange={(checked) =>
                                    update({
                                      models: provider.models.map((m, i) =>
                                        i === index ? { ...m, input: checked ? ['text', 'image'] : ['text'] } : m
                                      ),
                                    })
                                  }
                                />
                                <span>视觉能力</span>
                              </label>
                              {provider.api === 'openai-completions' && (
                                <div className="flex items-center gap-1.5 text-[12px] text-slate-600">
                                  <span>兼容输出参数</span>
                                  <CustomSelect
                                    ariaLabel={`兼容参数 ${index + 1}`}
                                    size="xs"
                                    value={model.compat?.maxTokensField ?? 'max_tokens'}
                                    onChange={(v) =>
                                      update({
                                        models: provider.models.map((m, i) =>
                                          i === index
                                            ? {
                                                ...m,
                                                compat: {
                                                  ...m.compat,
                                                  maxTokensField: v as 'max_tokens' | 'max_completion_tokens',
                                                  supportsStore: false,
                                                },
                                              }
                                            : m
                                        ),
                                      })
                                    }
                                    options={[
                                      { value: 'max_tokens', label: 'max_tokens' },
                                      { value: 'max_completion_tokens', label: 'max_completion_tokens' },
                                    ]}
                                  />
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              className="text-[11.5px] text-red-600 hover:bg-red-50 px-2 py-0.5 rounded-lg transition-colors"
                              onClick={() => update({ models: provider.models.filter((_, i) => i !== index) })}
                            >
                              移除模型
                            </button>
                          </div>
                        </div>
                      ))}
                    </fieldset>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          disabled={busy || !services.capabilities.credentials}
                          onClick={() => {
                            if (testing) {
                              test.current?.abort();
                              return;
                            }
                            const abort = new AbortController();
                            test.current = abort;
                            setTesting(true);
                            setTestResult(null);
                            void services.providers
                              .testDraft(provider, key || undefined, abort.signal)
                              .then((r) => setTestResult({ ok: r.ok, text: r.message }))
                              .catch((e) =>
                                setTestResult({
                                  ok: false,
                                  text: abort.signal.aborted ? '已取消测试' : String(e),
                                })
                              )
                              .finally(() => {
                                setTesting(false);
                                test.current = null;
                              });
                          }}
                          className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-[12px] transition-colors disabled:opacity-40"
                        >
                          {testing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                          ) : (
                            <Play className="w-3 h-3 fill-current text-blue-600" />
                          )}
                          <span>{testing ? '取消连接测试' : '测试草稿连接'}</span>
                        </button>
                        {testResult && (
                          <p
                            role="status"
                            className={`text-[12px] px-2.5 py-1 rounded-lg border ${
                              testResult.ok
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {testResult.text}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-[12px] text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-xl transition-colors"
                        onClick={() => setConfirmDeleteProvider(true)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>删除提供方及凭据</span>
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* TAB 2: ANNOTATION SETTINGS */}
            {activeTab === 'annot' && (
              <section key="annot" className="animate-float-in space-y-5 max-w-2xl">
                <div>
                  <span className="text-[10.5px] font-semibold uppercase tracking-widest text-blue-600">
                    Annotations
                  </span>
                  <h3 className="text-[16px] font-bold text-slate-900 tracking-tight">标注设置</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
                  <label className="block">
                    <span className="block text-[12px] font-medium text-slate-600 mb-1">标注作者</span>
                    <input
                      disabled={!loaded || busy}
                      aria-label="标注作者"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all"
                      value={draft.author}
                      onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                    />
                  </label>

                  <label className="block">
                    <span className="block text-[12px] font-medium text-slate-600 mb-1">对话面板宽度 (px)</span>
                    <input
                      disabled={!loaded || busy}
                      aria-label="对话面板宽度"
                      type="number"
                      min={340}
                      max={640}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all"
                      value={draft.chatWidth}
                      onChange={(e) => setDraft({ ...draft, chatWidth: Number(e.target.value) })}
                    />
                  </label>

                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/40">
                    <div>
                      <span className="block text-[12.5px] font-medium text-slate-700">默认标注颜色</span>
                      <span className="text-[11px] font-mono text-slate-400 uppercase">{draft.color}</span>
                    </div>
                    <CustomColorSwatch
                      ariaLabel="默认标注颜色"
                      value={draft.color}
                      onChange={(color) => setDraft({ ...draft, color })}
                      size="md"
                    />
                  </div>

                  <label className="block p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/40">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12.5px] font-medium text-slate-700">默认不透明度</span>
                      <span className="text-[11.5px] font-mono text-slate-500">
                        {Math.round(draft.opacity * 100)}%
                      </span>
                    </div>
                    <input
                      aria-label="默认不透明度"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      className="w-full px-2.5 py-1 border border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-hidden focus:border-blue-500 text-[12.5px]"
                      value={draft.opacity}
                      onChange={(e) => setDraft({ ...draft, opacity: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </section>
            )}

            {/* TAB 3: OCR SETTINGS */}
            {activeTab === 'ocr' && (
              <section key="ocr" className="animate-float-in space-y-5 max-w-2xl">
                <div>
                  <span className="text-[10.5px] font-semibold uppercase tracking-widest text-blue-600">
                    Local OCR
                  </span>
                  <h3 className="text-[16px] font-bold text-slate-900 tracking-tight">文字识别</h3>
                </div>

                <fieldset
                  disabled={!loaded || busy || !services.capabilities.ocr}
                  className="space-y-4 text-[13px] disabled:opacity-60"
                >
                  <legend className="sr-only">本机文字识别</legend>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-slate-600">模型档位</span>
                      <CustomSelect
                        ariaLabel="OCR 模型档位"
                        size="xs"
                        value={draft.ocr?.modelTier ?? 'Small'}
                        disabled={!loaded || busy || !services.capabilities.ocr}
                        onChange={(v) =>
                          setDraft({
                            ...draft,
                            ocr: {
                              modelTier: v as 'Tiny' | 'Small' | 'Medium',
                              backend: draft.ocr?.backend ?? 'Auto',
                              cacheMiB: draft.ocr?.cacheMiB ?? 512,
                            },
                          })
                        }
                        options={[
                          { value: 'Tiny', label: 'Tiny' },
                          { value: 'Small', label: 'Small' },
                          { value: 'Medium', label: 'Medium' },
                        ]}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      {[
                        { id: 'Tiny' as const, label: 'Tiny (轻量)', desc: '极速低内存' },
                        { id: 'Small' as const, label: 'Small (推荐)', desc: '均衡精准' },
                        { id: 'Medium' as const, label: 'Medium (高精)', desc: '复杂版面' },
                      ].map((tier) => {
                        const active = (draft.ocr?.modelTier ?? 'Small') === tier.id;
                        return (
                          <button
                            key={tier.id}
                            type="button"
                            disabled={!loaded || busy || !services.capabilities.ocr}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                ocr: {
                                  modelTier: tier.id,
                                  backend: draft.ocr?.backend ?? 'Auto',
                                  cacheMiB: draft.ocr?.cacheMiB ?? 512,
                                },
                              })
                            }
                            className={`p-3 rounded-xl border text-left transition-all ${
                              active
                                ? 'border-blue-500 bg-blue-50/30 ring-1 ring-blue-500/30'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="text-[12.5px] font-semibold text-slate-800">{tier.label}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{tier.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="block text-[12px] font-medium text-slate-600 mb-1">计算设备</span>
                      <CustomSelect
                        ariaLabel="OCR 计算设备"
                        className="w-full"
                        disabled={!loaded || busy || !services.capabilities.ocr}
                        value={draft.ocr?.backend ?? 'Auto'}
                        onChange={(v) =>
                          setDraft({
                            ...draft,
                            ocr: {
                              modelTier: draft.ocr?.modelTier ?? 'Small',
                              backend: v as 'Auto' | 'Cpu',
                              cacheMiB: draft.ocr?.cacheMiB ?? 512,
                            },
                          })
                        }
                        options={[
                          { value: 'Auto', label: '自动选择（失败后回退 CPU）' },
                          { value: 'Cpu', label: '仅 CPU' },
                        ]}
                      />
                    </div>

                    <label className="block">
                      <span className="block text-[12px] font-medium text-slate-600 mb-1">
                        文档与 OCR 缓存上限（MiB）
                      </span>
                      <input
                        type="number"
                        aria-label="OCR 缓存上限"
                        min={128}
                        max={4096}
                        className="w-full h-9 px-3 border border-slate-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-blue-500"
                        value={draft.ocr?.cacheMiB ?? 512}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            ocr: {
                              modelTier: draft.ocr?.modelTier ?? 'Small',
                              backend: draft.ocr?.backend ?? 'Auto',
                              cacheMiB: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setCacheStatus('');
                        void services.ocr
                          .clearCache()
                          .then((r) =>
                            setCacheStatus(
                              `已清理 ${Math.round(r.removedBytes / 1024 / 1024)} MiB 缓存；在用文档和结果保留`
                            )
                          )
                          .catch((e) => setError(String(e)));
                      }}
                      className="px-3.5 py-1.5 text-[12.5px] border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 font-medium transition-colors"
                    >
                      清理未使用的文档与 OCR 缓存
                    </button>
                  </div>
                  {cacheStatus && (
                    <ToastBanner tone="success" role="status">
                      {cacheStatus}
                    </ToastBanner>
                  )}
                </fieldset>
                {!services.capabilities.ocr && (
                  <p className="text-xs text-slate-500">真实 OCR 需要桌面服务，浏览器模式不进行识别。</p>
                )}
              </section>
            )}

            {/* TAB 4: ABOUT */}
            {activeTab === 'about' && (
              <section key="about" aria-label="关于" className="animate-float-in space-y-4 max-w-2xl text-sm">
                <div>
                  <span className="text-[10.5px] font-semibold uppercase tracking-widest text-blue-600">About</span>
                  <h3 className="text-[16px] font-bold text-slate-900 tracking-tight">关于</h3>
                </div>

                <div className="flex items-center space-x-3.5 p-4 rounded-2xl border border-slate-200/80 bg-slate-50/40">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-[0_8px_18px_-4px_rgba(37,99,235,0.4)]">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-[16px] font-bold text-slate-900">DocAss 文档助手</h4>
                    <p className="text-[12px] text-slate-500 font-mono mt-0.5">
                      版本 {about?.version ?? '正在读取…'}
                    </p>
                  </div>
                </div>

                {about?.runtime && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-xs text-slate-600 break-words font-mono">
                    {about.runtime}
                  </div>
                )}

                <details className="text-xs text-slate-600 bg-slate-50/50 rounded-xl border border-slate-200/70 p-3.5">
                  <summary className="cursor-pointer font-medium text-slate-700">开源许可证</summary>
                  <ul className="mt-2.5 space-y-1 pl-4 list-disc">
                    {about?.licenses.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </details>

                {services.capabilities.desktop && (
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => void services.diagnostics.openLogs().catch((e) => setError(String(e)))}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs text-slate-700 font-medium transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>打开日志目录</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void services.diagnostics.openLicenses().catch((e) => setError(String(e)))}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs text-slate-700 font-medium transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>打开许可证目录</span>
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>

        {/* Sticky Modal Footer */}
        <footer className="px-6 py-3.5 flex justify-end gap-2.5 border-t border-[#e3e6ea] bg-white/95 backdrop-blur-xs shrink-0">
          <button
            type="button"
            onClick={() => close()}
            disabled={busy}
            className="px-4 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 text-[13px] font-medium transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-xl text-[13px] font-medium shadow-[0_6px_16px_-4px_rgba(37,99,235,0.4)] disabled:opacity-50 transition-all active:scale-95"
            onClick={() => void save()}
            disabled={busy || !loaded || testing}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </footer>
      </div>

      <ConfirmDialog
        open={confirmDeleteProvider && !!provider}
        title="删除模型提供方"
        message={`确定删除「${provider?.name || '此提供方'}」及其加密凭据？引用它的历史会话会保留，继续提问前需重新选择模型。`}
        confirmLabel="确认删除"
        onCancel={() => setConfirmDeleteProvider(false)}
        onConfirm={() => {
          setConfirmDeleteProvider(false);
          if (!provider) return;
          setBusy(true);
          void services.providers
            .delete(provider.id)
            .then(() => {
              setProviders((list) => list.filter((p) => p.id !== provider.id));
              setSelected('');
              setKey('');
            })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
