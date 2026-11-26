import { Plus, Check, Play, Loader2, Trash2, Lock } from 'lucide-react';
import type { Provider } from '../../../contracts';
import { CustomSelect } from '../../primitives/CustomSelect';
import { CustomSwitch } from '../../primitives/CustomControls';

export function ProvidersTab({
  providers,
  setProviders,
  selected,
  selectProvider,
  provider,
  apiKey,
  setApiKey,
  loaded,
  busy,
  credentialsSupported,
  add,
  update,
  testing,
  setTesting,
  testRef,
  testResult,
  setTestResult,
  testDraft,
  onDeleteRequest,
}: {
  providers: Provider[];
  setProviders: React.Dispatch<React.SetStateAction<Provider[]>>;
  selected: string;
  selectProvider: (id: string) => void;
  provider?: Provider;
  apiKey: string;
  setApiKey: (k: string) => void;
  loaded: boolean;
  busy: boolean;
  credentialsSupported: boolean;
  add: () => void;
  update: (fields: Partial<Provider>) => void;
  testing: boolean;
  setTesting: (t: boolean) => void;
  testRef: React.RefObject<AbortController | null>;
  testResult: { ok?: boolean; text: string } | null;
  setTestResult: (r: { ok?: boolean; text: string } | null) => void;
  testDraft: (
    provider: Provider,
    key?: string,
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; message: string }>;
  onDeleteRequest: () => void;
}) {
  return (
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
            {providers.map(p => {
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
                      <div className="text-[11px] text-slate-400 font-mono truncate">
                        {p.baseUrl}
                      </div>
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
            onChange={e => selectProvider(e.target.value)}
          >
            {providers.map(p => (
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
                onChange={e => update({ name: e.target.value })}
              />
            </label>

            <div>
              <span className="block text-[11.5px] font-medium text-slate-600 mb-1">API 类型</span>
              <CustomSelect
                ariaLabel="API 类型"
                value={provider.api}
                onChange={v => update({ api: v as Provider['api'] })}
                className="w-full"
                options={[
                  {
                    value: 'openai-completions',
                    label: 'openai-completions',
                    description: 'OpenAI Chat Completions 兼容',
                  },
                  {
                    value: 'openai-responses',
                    label: 'openai-responses',
                    description: 'OpenAI Responses API',
                  },
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
              onChange={e => update({ baseUrl: e.target.value })}
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
                value={apiKey}
                disabled={!credentialsSupported}
                onChange={e => setApiKey(e.target.value)}
              />
            </label>
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
              <Lock className="w-3 h-3 shrink-0" />
              <span>
                {credentialsSupported
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
                onChange={v => update({ imageAllowed: v })}
              />
            </label>

            <div className="border-t border-slate-200/70 pt-2.5">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[12.5px] font-medium text-slate-700">设为默认提供方</span>
                <CustomSwitch
                  ariaLabel="默认提供方"
                  checked={provider.isDefault}
                  onChange={v =>
                    setProviders(list =>
                      list.map(p => ({ ...p, isDefault: p.id === selected && v })),
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
              <div
                key={index}
                className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 shadow-2xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className="block sm:col-span-1">
                    <span className="block text-[11px] text-slate-500 mb-0.5">模型 ID</span>
                    <input
                      aria-label={`模型 ID ${index + 1}`}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[12px] focus:outline-hidden focus:border-blue-500"
                      value={model.modelId}
                      onChange={e =>
                        update({
                          models: provider.models.map((m, i) =>
                            i === index ? { ...m, modelId: e.target.value } : m,
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
                      onChange={e =>
                        update({
                          models: provider.models.map((m, i) =>
                            i === index ? { ...m, contextWindow: Number(e.target.value) } : m,
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
                      onChange={e =>
                        update({
                          models: provider.models.map((m, i) =>
                            i === index ? { ...m, maxOutputTokens: Number(e.target.value) } : m,
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
                        onChange={checked =>
                          update({
                            models: provider.models.map((m, i) =>
                              i === index
                                ? { ...m, input: checked ? ['text', 'image'] : ['text'] }
                                : m,
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
                          onChange={v =>
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
                                  : m,
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
                    onClick={() =>
                      update({ models: provider.models.filter((_, i) => i !== index) })
                    }
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
                disabled={busy || !credentialsSupported}
                onClick={() => {
                  if (testing) {
                    testRef.current?.abort();
                    return;
                  }
                  const abort = new AbortController();
                  testRef.current = abort;
                  setTesting(true);
                  setTestResult(null);
                  void testDraft(provider, apiKey || undefined, abort.signal)
                    .then(r => setTestResult({ ok: r.ok, text: r.message }))
                    .catch(e =>
                      setTestResult({
                        ok: false,
                        text: abort.signal.aborted ? '已取消测试' : String(e),
                      }),
                    )
                    .finally(() => {
                      setTesting(false);
                      testRef.current = null;
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
              onClick={onDeleteRequest}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除提供方及凭据</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
