import { useEffect, useState } from 'react';
import { X, Settings as SettingsIcon, Lock } from 'lucide-react';
import type { Settings, Provider } from '../../contracts';
import type { AppServices } from '../../services/AppServices';

export function FoundationSettingsDialog({ services, initial, onSaved, onClose }: { services: AppServices; initial: Settings; onSaved: (settings: Settings) => void; onClose: () => void }) {
  const [draft,setDraft] = useState(initial), [providers,setProviders] = useState<Provider[]>([]), [selected,setSelected] = useState('');
  const [key,setKey] = useState(''), [error,setError] = useState(''), [cacheStatus,setCacheStatus] = useState(''), [busy,setBusy] = useState(false), [loaded,setLoaded] = useState(false);
  const provider = providers.find(p=>p.id===selected);
  useEffect(()=>{ let active=true;void Promise.all([services.providers.list(),services.settings.get()]).then(([list,settings])=>{if(active){setProviders(list);setSelected(list[0]?.id??'');setDraft(settings);setLoaded(true);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;}; },[services]);
  const close = () => { setKey(''); onClose(); };
  const update = (fields: Partial<Provider>) => setProviders(list=>list.map(p=>p.id===selected?{...p,...fields}:p));
  const save = async () => {
    setBusy(true);setError('');
    try { if (provider) await services.providers.save(provider,key || undefined); const saved = await services.settings.update(draft); setKey(''); onSaved(saved); close(); }
    catch(e) { setKey(''); setError(e instanceof Error?e.message:String(e)); }
    finally { setBusy(false); }
  };
  const add = () => { const id=crypto.randomUUID(); setProviders(list=>[...list,{id,name:'新提供方',api:'openai-completions',baseUrl:'https://api.openai.com/v1',isDefault:list.length===0,imageAllowed:false,models:[],hasKey:false}]);setSelected(id);setKey(''); };
  return <div role="dialog" aria-modal="true" aria-label="设置" className="fixed inset-0 z-50 bg-slate-900/25 flex items-center justify-center p-5">
    <div className="bg-white rounded-2xl shadow-xl w-[760px] max-w-full max-h-full overflow-auto border border-slate-200">
      <header className="flex justify-between items-center p-5 border-b border-slate-200"><h2 className="font-semibold flex items-center gap-2"><SettingsIcon size={18}/>设置</h2><button aria-label="关闭设置" onClick={close} disabled={busy}><X size={18}/></button></header>
      <div className="p-6 space-y-5 text-sm">
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <label className="block">标注作者<input disabled={!loaded||busy} aria-label="标注作者" className="settings-input" value={draft.author} onChange={e=>setDraft({...draft,author:e.target.value})}/></label>
        <label className="block">对话面板宽度<input disabled={!loaded||busy} aria-label="对话面板宽度" type="number" min={340} max={640} className="settings-input" value={draft.chatWidth} onChange={e=>setDraft({...draft,chatWidth:Number(e.target.value)})}/></label>
        <fieldset disabled={!loaded||busy||!services.capabilities.ocr} className="border-t pt-4 space-y-3"><legend className="font-semibold">本机文字识别</legend>
          <label className="block">模型档位 <select aria-label="OCR 模型档位" value={draft.ocr?.modelTier??'Small'} onChange={e=>setDraft({...draft,ocr:{modelTier:e.target.value as 'Tiny'|'Small'|'Medium',backend:draft.ocr?.backend??'Auto',cacheMiB:draft.ocr?.cacheMiB??512}})}>{['Tiny','Small','Medium'].map(t=><option key={t}>{t}</option>)}</select></label>
          <label className="block">计算设备 <select aria-label="OCR 计算设备" value={draft.ocr?.backend??'Auto'} onChange={e=>setDraft({...draft,ocr:{modelTier:draft.ocr?.modelTier??'Small',backend:e.target.value as 'Auto'|'Cpu',cacheMiB:draft.ocr?.cacheMiB??512}})}><option value="Auto">自动选择（失败后回退 CPU）</option><option value="Cpu">仅 CPU</option></select></label>
          <label className="block">文档与 OCR 缓存上限（MiB） <input type="number" aria-label="OCR 缓存上限" min={128} max={4096} value={draft.ocr?.cacheMiB??512} onChange={e=>setDraft({...draft,ocr:{modelTier:draft.ocr?.modelTier??'Small',backend:draft.ocr?.backend??'Auto',cacheMiB:Number(e.target.value)}})}/></label>
          <button onClick={()=>{setError('');setCacheStatus('');void services.ocr.clearCache().then(r=>setCacheStatus(`已清理 ${Math.round(r.removedBytes/1024/1024)} MiB 缓存；在用文档和结果保留`)).catch(e=>setError(String(e)));}}>清理未使用的文档与 OCR 缓存</button>
          {cacheStatus&&<p role="status" className="text-slate-600">{cacheStatus}</p>}
        </fieldset>
        {!services.capabilities.ocr&&<p className="text-xs text-slate-500">真实 OCR 需要桌面服务，浏览器模式不进行识别。</p>}
        <div className="border-t border-slate-200 pt-4 flex justify-between"><h3 className="font-semibold">模型提供方</h3><button disabled={!loaded||busy} onClick={add} className="text-blue-600">添加提供方</button></div>
        {providers.length===0 && <p className="text-slate-500">尚未配置提供方。</p>}
        {providers.length>0 && <select aria-label="提供方" className="settings-input" value={selected} onChange={e=>{setSelected(e.target.value);setKey('');}}>{providers.map(p=><option key={p.id} value={p.id}>{p.name}{p.hasKey?'（已保存密钥）':''}</option>)}</select>}
        {provider && <div className="space-y-3">
          <label className="block">名称<input aria-label="提供方名称" className="settings-input" value={provider.name} onChange={e=>update({name:e.target.value})}/></label>
          <label className="block">接口地址<input aria-label="接口地址" className="settings-input" value={provider.baseUrl} onChange={e=>update({baseUrl:e.target.value})}/></label>
          <label className="block">API 类型<select aria-label="API 类型" className="settings-input" value={provider.api} onChange={e=>update({api:e.target.value as Provider['api']})}>{['openai-completions','openai-responses','anthropic-messages','google-generative-ai'].map(api=><option key={api}>{api}</option>)}</select></label>
          <label className="block">{provider.hasKey?'更换密钥（留空保留）':'API Key'}<input aria-label="API Key" type="password" autoComplete="new-password" className="settings-input" value={key} disabled={!services.capabilities.credentials} onChange={e=>setKey(e.target.value)}/></label>
          <p className="text-xs text-slate-500 flex gap-1"><Lock size={14}/>{services.capabilities.credentials?'密钥仅加密保存在当前 Windows 用户账户中。':'浏览器模式不保存密钥，请使用桌面应用。'}</p>
          <label className="flex gap-2"><input type="checkbox" checked={provider.imageAllowed} onChange={e=>update({imageAllowed:e.target.checked})}/>允许图像输入</label>
          <button disabled={busy} className="text-red-600" onClick={async()=>{setBusy(true);try{await services.providers.delete(provider.id);setProviders(list=>list.filter(p=>p.id!==provider.id));setSelected('');setKey('');}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}}>删除提供方及凭据</button>
        </div>}
      </div>
      <footer className="p-4 flex justify-end gap-3 border-t border-slate-200"><button onClick={close} disabled={busy}>取消</button><button className="bg-blue-600 text-white px-5 py-2 rounded-lg disabled:opacity-50" onClick={()=>void save()} disabled={busy||!loaded}>{busy?'保存中…':'保存'}</button></footer>
    </div>
  </div>;
}
