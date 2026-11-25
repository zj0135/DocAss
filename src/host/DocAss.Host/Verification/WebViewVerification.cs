using DocAss.Host.Contracts;
using Microsoft.Web.WebView2.Core;
using System.Text.Json;

namespace DocAss.Host.Verification;

public static class WebViewVerification
{
    public static async Task RunAsync(CoreWebView2 core, string output, Func<Task> close, Func<object> diagnostics)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(output)!);
        try
        {
            await core.ExecuteScriptAsync("""
                window.__verification = null;
                (async () => {
                  const pending = new Map();
                  chrome.webview.addEventListener('message', e => { const m = e.data; if (m.kind === 'res' && pending.has(m.id)) { const [ok, no] = pending.get(m.id); pending.delete(m.id); m.ok ? ok(m.result) : no(m.error); } });
                  const call = (method, params = {}) => new Promise((ok, no) => { const id = crypto.randomUUID(); pending.set(id, [ok, no]); chrome.webview.postMessage({v:1,kind:'req',id,method,params}); });
                  const bootstrap = await call('app.bootstrap');
                  for(let i=0;i<100&&!document.querySelector('footer')?.textContent.includes('桌面模式');i++) await new Promise(r=>setTimeout(r,50));
                  const visibleWorkspace=document.querySelector('h1')?.textContent==='欢迎使用 DocAss' && document.querySelector('footer')?.textContent.includes('桌面模式') && !document.querySelector('[role="alert"]');
                  if(!visibleWorkspace) throw new Error('Published workspace did not render');
                  const results = await Promise.all(Array.from({length:100}, () => call('settings.get')));
                  const ping = await (await fetch('/_host/ping')).json();
                  const module=await import('/_host/verify/module.mjs');
                  const workerReady=await new Promise((resolve,reject)=>{const worker=new Worker('/_host/verify/worker.mjs',{type:'module'});worker.onmessage=e=>{resolve(e.data);worker.terminate();};worker.onerror=reject;});
                  const wasm=await WebAssembly.instantiateStreaming(fetch('/_host/verify/minimal.wasm'));
                  const failureStatus=(await fetch('/_host/verify/failure')).status;
                  const abort=new AbortController();const slow=fetch('/_host/verify/slow',{signal:abort.signal}).catch(e=>e.name);setTimeout(()=>abort.abort(),20);const aborted=await slow;
                  await new Promise(r=>setTimeout(r,200));const afterAbort=(await fetch('/_host/ping')).status;
                  const resourcesOk=module.value===42&&workerReady==='worker-ready'&&Boolean(wasm.instance)&&failureStatus===500&&aborted==='AbortError'&&afterAbort===200;
                  let ticks = 0; const timer = setInterval(() => ticks++, 5);
                  const upload = await (await fetch('/_host/verify/upload', {method:'POST',body:new Uint8Array(16*1024*1024)})).json();
                  clearInterval(timer);
                  const range = await fetch('/_host/verify/bytes', {headers:{Range:'bytes=-8'}});
                  const rangeBytes = Array.from(new Uint8Array(await range.arrayBuffer()));
                  const response = await fetch(bootstrap.loopback.origin+'/fixture/stream', {method:'POST',headers:{'Content-Type':'application/json','X-DocAss-Session':bootstrap.loopback.token,'X-Request-Id':crypto.randomUUID()},body:'{}'});
                  if (!response.ok) throw new Error('SSE status '+response.status);
                  const reader = response.body.getReader(); const times = []; const started = performance.now(); let text = '';
                  for (;;) { const {done,value} = await reader.read(); if (done) break; times.push(performance.now()-started); text += new TextDecoder().decode(value); }
                  const controller = new AbortController(); const requestId = crypto.randomUUID();
                  const cancelledStream = await fetch(bootstrap.loopback.origin+'/fixture/stream', {method:'POST',headers:{'Content-Type':'application/json','X-DocAss-Session':bootstrap.loopback.token,'X-Request-Id':requestId},body:'{}',signal:controller.signal});
                  await cancelledStream.body.getReader().read(); const cancelStart = performance.now(); controller.abort(); await call('stream.cancel',{requestId});
                  const cancelMs = performance.now()-cancelStart;
                  const ok = resourcesOk && results.length===100 && results.every(r=>typeof r.author==='string') && ping.v===1 && upload.length===16777216 && range.status===206 && rangeBytes[0]===248 && times.length>=3 && text.includes('[DONE]') && cancelMs<100;
                  window.__verification={ok,resourcesOk,visibleWorkspace,concurrentRequests:results.length,ping,upload,uiTicksDuringUpload:ticks,rangeStatus:range.status,rangeBytes,sseUpdates:times.length,sseTimes:times,cancelMs,pending:pending.size,emptyWorkspace:!document.body.innerText.includes('年度经营分析报告')};
                })().catch(e=>window.__verification={ok:false,error:String(e?.message||e)});
                """);
            string result = "null";
            for (var i = 0; i < 300; i++) { await Task.Delay(100); result = await core.ExecuteScriptAsync("window.__verification"); if (result != "null") break; }
            using var parsed = JsonDocument.Parse(result);
            var fields = parsed.RootElement.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
            fields["webviewRuntime"] = Json.Element(core.Environment.BrowserVersionString);
            fields["sdk"] = Json.Element("11.0.100");
            fields["hostDiagnostics"] = Json.Element(diagnostics());
            await File.WriteAllTextAsync(output, Json.String(fields));
            using var screenshot = File.Create(Path.ChangeExtension(output, ".png")); await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, screenshot);
        }
        catch (Exception ex) { await File.WriteAllTextAsync(output, Json.String(new { ok = false, error = ex.Message })); }
        finally { await close(); }
    }
}
