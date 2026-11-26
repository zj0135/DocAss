using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using DocAss.Host.Contracts;
using DocAss.Host.Storage;
using DocAss.Host.Verification;
using DocAss.Host.Windowing;
using Microsoft.Web.WebView2.Core;

namespace DocAss.Host;
public sealed partial class MainWindow
{
    private bool acceptanceStarted;
    private readonly Dictionary<string,object?> acceptanceResults=new();
    private NativeInput.Point originalCursor;
    private nint originalForeground;
    private readonly List<string> permissionRequests=new();
    private readonly List<string> windowMessages=new();
    private Documents.DocumentRegistry? acceptanceWriter;
    private void RegisterAcceptanceMethods()
    {
        resources.Register("GET","/_host/verify/module.mjs",(_,_)=>Task.FromResult(new Http.ResourceResponse(200,Http.HostResourceHandler.Mime("module.mjs"),System.Text.Encoding.UTF8.GetBytes("export const value=42;"))));
        resources.Register("GET","/_host/verify/worker.mjs",(_,_)=>Task.FromResult(new Http.ResourceResponse(200,Http.HostResourceHandler.Mime("worker.mjs"),System.Text.Encoding.UTF8.GetBytes("self.postMessage('worker-ready');"))));
        resources.Register("GET","/_host/verify/minimal.wasm",(_,_)=>Task.FromResult(new Http.ResourceResponse(200,Http.HostResourceHandler.Mime("minimal.wasm"),[0,97,115,109,1,0,0,0])));
        resources.Register("GET","/_host/verify/failure",(_,_)=>throw new IOException("acceptance failure"));
        resources.Register("GET","/_host/verify/slow",async(_,token)=>{await Task.Delay(150,token);return Http.ResourceResponse.Json(200,new{ok=true});});
        bridge.Register("doc.openFixture", async (p, _) =>
        {
            Contract.Fields(p,"name");var name=p.GetProperty("name").GetString();Contract.Require(name is "report" or "contract");
            var handle=documents.Register(new string(name=="report"?'a':'b',64),name=="report"?"验收报告.pdf":"验收合同.pdf",12);
            if(handle.Access=="edit")await storage.EnsureDocumentAsync(handle,12);return handle;
        });
    }
    private async Task VerifyStartupFailureAsync(string actual)
    {
        if(acceptance==null)return;
        await Dispatcher.InvokeAsync(()=>{});await Task.Delay(100);
        var texts=((StackPanel)Content).Children.OfType<TextBlock>().Select(t=>t.Text).ToArray();
        var action=((StackPanel)Content).Children.OfType<Button>().Any();
        await FinishAcceptanceAsync(new {ok=actual==acceptance.Scenario&&(actual!="runtimeMissing"||action),scenario=actual,texts,action,development});
    }
    private async Task RunAcceptanceAsync()
    {
        if(acceptanceStarted||acceptance==null)return;acceptanceStarted=true;
        if(acceptance.Scenario=="channel") { await WebViewVerification.RunAsync(web.CoreWebView2,acceptance.Output,async()=>{mayClose=true;await CleanupAsync();Close();},()=>new{resourceStarted,resourceCompleted,permissionRequests});return; }
        try
        {
            for(var i=0;i<200;i++){if(await web.CoreWebView2.ExecuteScriptAsync("document.querySelector('footer')?.textContent.includes('桌面模式')") == "true")break;await Task.Delay(50);}
            if(await web.CoreWebView2.ExecuteScriptAsync("Boolean(document.querySelector('footer')?.textContent.includes('桌面模式'))")!="true")throw new Exception("Workspace did not bootstrap");
            if(acceptance.Scenario=="hmr") { await VerifyHmrAsync();return; }
            if(acceptance.Scenario=="reading") { await VerifyReadingAsync();return; }
            if(acceptance.Scenario=="annotations") {await VerifyAnnotationsAsync();return;}
            if(acceptance.Scenario is "ocr" or "ocrBenchmark") {await VerifyOcrAsync();return;}
            NativeInput.GetCursorPos(out originalCursor);originalForeground=NativeInput.GetForegroundWindow();Topmost=true;NativeInput.Activate(this);await Task.Delay(400);
            if(acceptance.Scenario is "closeButton" or "altF4")
            {
                if(acceptance.Scenario=="closeButton") await ClickButton("关闭");else {await NativeInput.Click(web.PointToScreen(new Point(420,80)));await NativeInput.AltF4();}
                return;
            }
            var core=web.CoreWebView2;
            WindowState=WindowState.Normal;Left=80;Top=80;Width=1100;Height=700;await Task.Delay(200);
            var titlePoint=web.PointToScreen(new Point(420,24));var before=new Bounds(Left,Top,Width,Height);
            acceptanceResults["titleHitTest"]=NativeInput.HitTest(titlePoint);
            await NativeInput.Drag(titlePoint,100,70);
            Check("nativeDrag",Math.Abs(Left-before.Left)>30&&Math.Abs(Top-before.Top)>20);
            titlePoint=web.PointToScreen(new Point(420,24));await NativeInput.Click(titlePoint,true);
            acceptanceResults["windowMessages"]=windowMessages;acceptanceResults["windowStyle"]=NativeInput.Style(new WindowInteropHelper(this).Handle);
            Check("nativeDoubleClickMaximize",WindowState==WindowState.Maximized);
            Check("maximizedIconSync",await core.ExecuteScriptAsync("Boolean(document.querySelector('button[title=还原]'))")=="true");
            titlePoint=web.PointToScreen(new Point(420,24));await NativeInput.Click(titlePoint,true);
            Check("nativeDoubleClickRestore",WindowState==WindowState.Normal);
            var left=Left;var top=Top;await ClickButton("最大化");Check("maximizeButton",WindowState==WindowState.Maximized);await ClickButton("还原");Check("restoreButton",WindowState==WindowState.Normal);
            Check("buttonDoesNotDrag",Math.Abs(left-Left)<2&&Math.Abs(top-Top)<2);
            await ClickButton("最小化");Check("minimizeButton",WindowState==WindowState.Minimized);WindowState=WindowState.Normal;NativeInput.Activate(this);
            NativeInput.PostMessage(new WindowInteropHelper(this).Handle,0x112,0xF030,0);await Task.Delay(200);
            Check("systemMaximizeIconSync",await core.ExecuteScriptAsync("Boolean(document.querySelector('button[title=还原]'))")=="true");
            WindowState=WindowState.Normal;
            // Model removal of a secondary monitor: an off-screen window receives the real display-change message.
            Left=30000;Top=20000;await Task.Delay(100);NativeInput.PostMessage(new WindowInteropHelper(this).Handle,0x7e,32,0);await Task.Delay(500);
            var area=WindowPlacement.SelectWorkArea(new(Left,Top,Width,Height),MonitorWorkAreas.Get(this));
            Check("removedMonitorRecovery",Left>=area.Left&&Top>=area.Top&&Left+Width<=area.Left+area.Width+1&&Top+Height<=area.Top+area.Height+1);
            await SavePlacementAsync();var saved=await settings.GetAsync();Check("placementPersisted",saved.GetProperty("window").GetProperty("left").GetDouble()==Left);
            await VerifyDesktopWorkflowAsync();
            acceptanceResults["monitorScenario"]="OS WM_DISPLAYCHANGE with window on removed virtual location; no physical cable unplug claimed";
            acceptanceResults["ok"]=true;await FinishAcceptanceAsync(acceptanceResults);
        }
        catch(Exception ex){acceptanceResults["ok"]=false;acceptanceResults["error"]=ex.ToString();if(acceptance.Scenario=="reading")acceptanceResults["pageErrors"]=await web.CoreWebView2.ExecuteScriptAsync("window.__readingErrors");if(acceptance.Scenario.StartsWith("ocr"))acceptanceResults["ocrJobs"]=ocr.Diagnostics;await FinishAcceptanceAsync(acceptanceResults);}
    }
    private void Check(string name,bool pass){acceptanceResults[name]=pass;if(!pass)throw new Exception(name+" failed");}
    private async Task ClickButton(string title)
    {
        var json=await web.CoreWebView2.ExecuteScriptAsync($"(()=>{{const b=document.querySelector('button[title={title}]');if(!b)throw Error('Button missing');const r=b.getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}};}})()");
        using var point=JsonDocument.Parse(json);await NativeInput.Click(web.PointToScreen(new Point(point.RootElement.GetProperty("x").GetDouble(),point.RootElement.GetProperty("y").GetDouble())));
    }
    private async Task VerifyHmrAsync()
    {
        var core=web.CoreWebView2;await core.ExecuteScriptAsync("window.__hmrIdentity='preserved'");
        var before=await core.ExecuteScriptAsync("document.querySelector('[data-build-stamp]')?.getAttribute('data-build-stamp')");
        await File.WriteAllTextAsync(acceptance!.Output+".ready",before);
        for(var i=0;i<400;i++)
        {
            var after=await core.ExecuteScriptAsync("document.querySelector('[data-build-stamp]')?.getAttribute('data-build-stamp')");
            if(after!=before&&after!="null") {var preserved=await core.ExecuteScriptAsync("window.__hmrIdentity==='preserved'")=="true";await FinishAcceptanceAsync(new{ok=preserved,scenario="hmr",development,before,after,jsContextPreserved=preserved});return;}await Task.Delay(100);
        }
        throw new TimeoutException("HMR update not observed");
    }
    private async Task RecordClosingAcceptanceAsync()
    {
        var backup=RecoveryService.Inspect(storage.BackupPath);
        await File.WriteAllTextAsync(acceptance!.Output,Json.String(new{ok=close.State=="saved",scenario=acceptance.Scenario,closeState=close.State,backupExists=File.Exists(storage.BackupPath),backupTime=backup.ModifiedUtc,loopbackOrigin=loopback.Origin}));RestoreInput();
    }
    private void RestoreInput(){if(originalForeground!=0)NativeInput.SetForegroundWindow(originalForeground);if(originalForeground!=0)NativeInput.SetCursorPos(originalCursor.X,originalCursor.Y);}
    private async Task FinishAcceptanceAsync(object result)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(acceptance!.Output)!);await File.WriteAllTextAsync(acceptance.Output,Json.String(result));
        using(var file=File.Create(Path.ChangeExtension(acceptance.Output,".png")))
        {
            if(web.CoreWebView2!=null&&ReferenceEquals(Content,web))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,file);
            else {UpdateLayout();var image=new RenderTargetBitmap((int)ActualWidth,(int)ActualHeight,96,96,PixelFormats.Pbgra32);image.Render(this);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(image));encoder.Save(file);}
        }
        RestoreInput();mayClose=true;await CleanupAsync();Close();
    }
    private async Task VerifyDesktopWorkflowAsync()
    {
        // Only --verify exposes fixtures; ordinary launches keep the empty production workspace.
        acceptanceWriter=new(dataDirectory);var handle=acceptanceWriter.Register(new string('a',64),"验收报告.pdf",12);await storage.EnsureDocumentAsync(handle,12);
        var uploadService=new AttachmentService(storage,acceptanceWriter,dataDirectory);var attachment=uploadService.Begin(handle.DocId);
        await uploadService.UploadAsync(handle.DocId,attachment,new MemoryStream(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=")),"image/png",default);await uploadService.CommitAsync(handle.DocId,attachment);
        var conversation=Guid.NewGuid().ToString();var command=Json.Element(new{type="batch",mutations=new object[]{new{type="conversation.put",value=new{id=conversation,title="附件验收",modelRef="fixture",createdAt="2026-11-25"}},new{type="message.put",value=new{id=Guid.NewGuid().ToString(),conversationId=conversation,parentId=(string?)null,branchId=conversation,role="user",createdAt="2026-11-25",state="completed",sequence=0,content=new object[]{new{type="text",text="附件丢失时文字仍可阅读"},new{type="attachment",attachmentId=attachment}}}}}});
        await storage.CommitAsync(Json.Element(new{schemaVersion=1,docId=handle.DocId,operationId=Guid.NewGuid().ToString(),expectedRevision=await storage.ReadRevisionAsync(handle.DocHash),payloadHash=Json.PayloadHash(handle.DocHash,command),command}),acceptanceWriter);
        File.Delete(Path.Combine(dataDirectory,"attachments",handle.DocHash,attachment+".png"));
        await RunPageCheck("readOnlyUi", """
            button('打开报告示例').click();await until(()=>document.querySelector('main[data-access="readOnly"]'));
            await until(()=>document.body.innerText.includes('附件不可用'));
            check(document.querySelector('textarea').disabled && button('保存笔记').disabled && button('生成示例回复').disabled,'read-only controls');
            check(document.body.innerText.includes('附件丢失时文字仍可阅读'),'message text retained');
            button('下一页').click();await until(()=>document.querySelector('[data-testid="page"]').textContent.includes('2'));
            """);
        acceptanceWriter.Dispose();acceptanceWriter=null;
        await RunPageCheck("reacquireAndStreamUi", """
            button('重新取得编辑权限').click();await until(()=>document.querySelector('main[data-access="edit"]'));
            check(!button('保存笔记').disabled,'editing reacquired');
            setValue(document.querySelector('textarea'),'原生宿主确认保存');await pause(30);button('保存笔记').click();await until(()=>document.querySelector('li')?.parentElement.innerText.includes('原生宿主确认保存'));
            const reply=document.querySelector('[data-testid="fixture-reply"]');const frames=[];let observing=true,previous='';
            const observe=()=>{if(reply.textContent!==previous){previous=reply.textContent;frames.push({text:previous,time:performance.now()});}if(observing)requestAnimationFrame(observe);};requestAnimationFrame(observe);
            button('生成示例回复').click();await until(()=>reply.textContent.includes('第四段'));await pause(50);observing=false;
            check(frames.filter(f=>f.text&&!f.text.includes('第四段')).length>=2,'incremental painted UI');window.__streamFrames=frames;
            await until(()=>button('生成示例回复'));button('生成示例回复').click();await until(()=>reply.textContent==='第一段'&&button('停止示例回复'));const started=performance.now();button('停止示例回复').click();await until(()=>button('生成示例回复'));const cancelMs=performance.now()-started;check(cancelMs<100,'cancel feedback');window.__cancelUiMs=cancelMs;const text=reply.textContent;await pause(350);check(reply.textContent===text,'no post-cancel append');
            """);
        for(var i=0;i<20&&(loopback.CancelledRequests==0||loopback.ActiveRequests!=0);i++)await Task.Delay(50);
        Check("upstreamCancelled",loopback.CancelledRequests>0&&loopback.ActiveRequests==0);
        acceptanceResults["paintedStreamFrames"]=JsonDocument.Parse(await web.CoreWebView2.ExecuteScriptAsync("window.__streamFrames")).RootElement.Clone();
        acceptanceResults["cancelUiMs"]=JsonDocument.Parse(await web.CoreWebView2.ExecuteScriptAsync("window.__cancelUiMs")).RootElement.Clone();
        acceptanceResults["permissionRequests"]=permissionRequests;
        acceptanceResults["browserSecurityFlags"]="none";
        await RunPageCheck("credentialForm", """
            document.querySelector('button[title="设置"]').click();await until(()=>button('添加提供方')&&!button('添加提供方').disabled);button('添加提供方').click();await until(()=>document.querySelector('input[aria-label="API Key"]'));
            setValue(document.querySelector('input[aria-label="API Key"]'),'acceptance-only-secret');await pause(30);button('保存').click();await until(()=>!document.querySelector('[role="dialog"]'));
            document.querySelector('button[title="设置"]').click();await until(()=>document.querySelector('input[aria-label="API Key"]'));check(document.querySelector('input[aria-label="API Key"]').value==='','cleared after save');
            setValue(document.querySelector('input[aria-label="API Key"]'),'unsaved-secret');await pause(30);document.querySelector('button[aria-label="关闭设置"]').click();await pause(30);
            document.querySelector('button[title="设置"]').click();await until(()=>document.querySelector('input[aria-label="API Key"]'));check(document.querySelector('input[aria-label="API Key"]').value==='','cleared after close');document.querySelector('button[aria-label="关闭设置"]').click();
            """);
    }
    private async Task RunPageCheck(string name,string script,int timeout=3000)
    {
        await web.CoreWebView2.ExecuteScriptAsync("window.__pageCheckTimeout="+timeout);
        await web.CoreWebView2.ExecuteScriptAsync("""
            window.__pageCheck=null;(async()=>{
            const pause=ms=>new Promise(r=>setTimeout(r,ms));
            const button=text=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text);
            const check=(value,message)=>{if(!value)throw Error(message);};
            const until=async predicate=>{for(let i=0;i<Math.ceil(window.__pageCheckTimeout/10);i++){if(predicate())return;await pause(10);}throw Error('Timeout: '+predicate);};
            const setValue=(input,value)=>{Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};
            """+script+";window.__pageCheck={ok:true};})().catch(e=>window.__pageCheck={ok:false,error:String(e)});");
        for(var i=0;i<Math.Max(200,(timeout+2000)/50);i++)
        {
            var value=await web.CoreWebView2.ExecuteScriptAsync("window.__pageCheck");if(value!="null"){using var result=JsonDocument.Parse(value);acceptanceResults[name]=result.RootElement.Clone();if(!result.RootElement.GetProperty("ok").GetBoolean())throw new Exception(name+": "+value);return;}await Task.Delay(50);
        }
        throw new TimeoutException(name);
    }
}
