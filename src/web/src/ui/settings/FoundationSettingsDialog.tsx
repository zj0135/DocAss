import { useEffect, useState, useRef } from 'react';
import { X, Settings as SettingsIcon, Sparkles, Layers, Cpu, Info } from 'lucide-react';
import type { Settings, Provider } from '../../contracts';
import type { AppServices } from '../../services/AppServices';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { ToastBanner } from '../primitives/ToastBanner';
import { ProvidersTab } from './tabs/ProvidersTab';
import { AnnotationTab } from './tabs/AnnotationTab';
import { OcrTab } from './tabs/OcrTab';
import { AboutTab } from './tabs/AboutTab';

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

  const provider = providers.find(p => p.id === selected);
  const [about, setAbout] = useState<{ version: string; runtime: string; licenses: string[] }>();

  useEffect(() => {
    void services.diagnostics
      .info()
      .then(setAbout)
      .catch(e => setError(String(e)));
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
      .catch(e => {
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
    setProviders(list => list.map(p => (p.id === selected ? { ...p, ...fields } : p)));

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
    setProviders(list => [
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
    {
      id: 'providers',
      label: '模型提供方',
      sub: 'API & 模型',
      icon: <Sparkles className="w-4 h-4" />,
    },
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
              <h2 className="text-[15.5px] font-bold text-[#1f2329] tracking-tight leading-none">
                设置
              </h2>
              <p className="text-[11px] text-slate-400 mt-1 leading-none">
                偏好配置、模型接口与本地识别
              </p>
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
          {navItems.map(item => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-white text-blue-600 shadow-2xs ring-1 ring-slate-200'
                    : 'text-slate-600'
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
            {navItems.map(item => {
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
                    <div
                      className={`text-[13px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}
                    >
                      {item.label}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5 leading-tight">
                      {item.sub}
                    </div>
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

            {activeTab === 'providers' && (
              <ProvidersTab
                providers={providers}
                setProviders={setProviders}
                selected={selected}
                selectProvider={selectProvider}
                provider={provider}
                apiKey={key}
                setApiKey={setKey}
                loaded={loaded}
                busy={busy}
                credentialsSupported={services.capabilities.credentials}
                add={add}
                update={update}
                testing={testing}
                setTesting={setTesting}
                testRef={test}
                testResult={testResult}
                setTestResult={setTestResult}
                testDraft={(prov, keyVal, sig) => services.providers.testDraft(prov, keyVal, sig)}
                onDeleteRequest={() => setConfirmDeleteProvider(true)}
              />
            )}

            {activeTab === 'annot' && (
              <AnnotationTab draft={draft} setDraft={setDraft} loaded={loaded} busy={busy} />
            )}

            {activeTab === 'ocr' && (
              <OcrTab
                draft={draft}
                setDraft={setDraft}
                loaded={loaded}
                busy={busy}
                ocrSupported={services.capabilities.ocr}
                clearCache={() => services.ocr.clearCache()}
                cacheStatus={cacheStatus}
                setCacheStatus={setCacheStatus}
                setError={setError}
              />
            )}

            {activeTab === 'about' && (
              <AboutTab
                about={about}
                desktopSupported={services.capabilities.desktop}
                openLogs={() => services.diagnostics.openLogs()}
                openLicenses={() => services.diagnostics.openLicenses()}
                setError={setError}
              />
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
              setProviders(list => list.filter(p => p.id !== provider.id));
              setSelected('');
              setKey('');
            })
            .catch(e => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
