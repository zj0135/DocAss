using DocAss.Host.Contracts;
using DocAss.Host.Verification;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
namespace DocAss.Host;
public sealed partial class MainWindow
{
    private async Task VerifyAnnotationsAsync()
    {
        NativeInput.GetCursorPos(out originalCursor);originalForeground=NativeInput.GetForegroundWindow();Topmost=true;NativeInput.Activate(this);web.Focus();await Task.Delay(400);
        var root=new DirectoryInfo(AppContext.BaseDirectory);while(root!=null&&!File.Exists(Path.Combine(root.FullName,"DocAss.sln")))root=root.Parent;
        var source=Path.Combine(dataDirectory,"annotation-source.pdf");File.Copy(Path.Combine(root!.FullName,"docs","fixtures","generated","native-matrix.pdf"),source);
        var opened=await files.OpenAsync(source);Emit("doc.opened",opened);var handle=opened.Handle!;
        await RunPageCheck("annotationDocument", """
            await until(()=>document.querySelector('[data-reader]'));button('适合整页').click();await until(()=>document.querySelector('[data-page="1"] canvas[data-rendered]'));
            await until(()=>document.querySelector('[data-reader]').dataset.textPages.split(',').includes('1'));await pause(300);
            """);
        var first=await geometry.ExtractAsync(handle.DocId,1,Guid.NewGuid().ToString());var second=await geometry.ExtractAsync(handle.DocId,2,Guid.NewGuid().ToString());
        await NativeInput.DragAcrossLayout(await GlyphScreenPointAsync(first,0,false,0),async()=>
        {
            await RunPageCheck("crossPageHighlightSelection", """
                const scroller=document.querySelector('[data-testid="reader-scroll"]');await until(()=>document.querySelector('[data-page="2"]'));
                scroller.scrollTop+=document.querySelector('[data-page="2"]').getBoundingClientRect().top-scroller.getBoundingClientRect().top-20;
                await until(()=>document.querySelector('[data-reader]').dataset.textPages.split(',').includes('2'));await pause(150);
                """);return await GlyphScreenPointAsync(second,2,true,0);
        });
        await RunPageCheck("commitTextGroup", """
            await until(()=>button('高亮选中文字'));button('高亮选中文字').click();await pause(100);await until(()=>document.body.innerText.includes('已自动保存'));button('标注').click();await until(()=>document.querySelectorAll('[data-annotation-id]').length===2);
            button('撤销').click();await until(()=>document.querySelectorAll('[data-annotation-id]').length===0);button('重做').click();await until(()=>document.querySelectorAll('[data-annotation-id]').length===2);await until(()=>document.body.innerText.includes('已自动保存'));
            """);
        var saved=await storage.ReadDocumentAsync(handle.DocHash);Check("twoPageAtomicGroup",saved.Annotations.Length==2&&saved.Annotations[0].GetProperty("groupId").GetString()==saved.Annotations[1].GetProperty("groupId").GetString()&&saved.DocumentRevision==3);
        var originalQuads=saved.Annotations.Select(a=>a.GetProperty("quads").GetRawText()).ToArray();
        await RunPageCheck("closeAndReopenAnnotations", """
            document.querySelector('button[title="关闭标签页 (Ctrl+W)"]').click();await until(()=>!document.querySelector('[data-reader]'));
            button('annotation-source.pdf').click();await until(()=>document.querySelector('[data-reader]'));button('标注').click();await until(()=>document.querySelectorAll('[data-annotation-id]').length===2);button('适合整页').click();button('旋转').click();await pause(700);
            await until(()=>{const c=document.querySelector('[data-page="1"] canvas[data-rendered]');if(!c)return false;const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let dark=0;for(let i=0;i<p.length;i+=4)if(p[i]<100&&p[i+3])dark++;return dark>100;});
            """,10000);
        Check("persistedTextQuads",(await storage.ReadDocumentAsync(handle.DocHash)).Annotations.Select(a=>a.GetProperty("quads").GetRawText()).SequenceEqual(originalQuads));
        using(var screenshot=File.Create(Path.Combine(Path.GetDirectoryName(acceptance!.Output)!,"annotations-rotated.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,screenshot);
        await File.AppendAllTextAsync(source,"\n% external document revision\n");
        await Task.Delay(5200);
        await RunPageCheck("versionAndPreview", """
            await until(()=>button('打开新版本'));button('打开新版本').click();await until(()=>button('预览标注迁移'));button('预览标注迁移').click();await until(()=>button('确认复制标注到新版本'));check(document.body.innerText.includes('待复核'),'ambiguous quote review');button('确认复制标注到新版本').click();await until(()=>!document.querySelector('[aria-label="标注迁移"]'));button('标注').click();await until(()=>document.querySelectorAll('[data-annotation-id]').length===2);
            """,20000);
        var next=await files.OpenAsync(source);var migrated=await storage.ReadDocumentAsync(next.Handle!.DocHash);
        Check("migrationPreservesOld",migrated.Annotations.Length==2&&(await storage.ReadDocumentAsync(handle.DocHash)).Annotations.Length==2&&migrated.Annotations.Any(a=>a.GetProperty("migrationState").GetString()=="needsReview"));
        await RunPageCheck("prepareSlowDraw", """
            button('适合整页').click();document.querySelector('button[aria-label="矩形工具"]').click();await pause(400);
            """);
        storage.FaultInjection=step=>{if(step=="revision")throw new IOException("injected write failure");};
        var failedFrom=await AnnotationScreenPointAsync(.2,.45);await NativeInput.Drag(failedFrom,50,35);
        await RunPageCheck("failedSaveBlocksClose", """
            await until(()=>button('重试保存'));const tabs=document.querySelectorAll('button[title="关闭标签页 (Ctrl+W)"]');tabs[tabs.length-1].click();await until(()=>document.querySelector('[aria-label="关闭前保存"]'));button('取消关闭').click();await until(()=>!document.querySelector('[aria-label="关闭前保存"]'));check(!!button('重试保存'),'dirty edit preserved');
            """);
        storage.FaultInjection=null;
        await RunPageCheck("retryFailedSave", """
            button('重试保存').click();await until(()=>!button('重试保存'));await until(()=>document.body.innerText.includes('已自动保存'));
            """);
        Check("failedCommandRetried",(await storage.ReadDocumentAsync(next.Handle.DocHash)).Annotations.Length==3);
        var slowOnce=0;storage.FaultInjection=step=>{if(step=="revision"&&Interlocked.Increment(ref slowOnce)==1)Thread.Sleep(5000);};
        var from=await AnnotationScreenPointAsync(.25,.5);await NativeInput.Drag(from,60,35);
        await RunPageCheck("slowSaveClose", """
            await until(()=>document.body.innerText.includes('保存中'));const tabs=document.querySelectorAll('button[title="关闭标签页 (Ctrl+W)"]');tabs[tabs.length-1].click();await pause(2100);check(document.body.innerText.includes('正在保存并关闭'),'still waiting after two seconds');await pause(3000);await until(()=>document.querySelectorAll('button[title="关闭标签页 (Ctrl+W)"]').length===1);
            """);
        storage.FaultInjection=null;Check("slowCommandAcknowledged",(await storage.ReadDocumentAsync(next.Handle.DocHash)).Annotations.Length==4);
        await RunPageCheck("underlineTool", """
            document.querySelector('button[aria-label="下划线工具"]').click();await until(()=>document.querySelector('[data-reader]').dataset.textPages.split(',').includes('1'));await pause(400);
            """);
        var lineFrom=await GlyphScreenPointAsync(first,0,false,90);var lineTo=await GlyphScreenPointAsync(first,2,true,90);await NativeInput.Drag(lineFrom,(int)(lineTo.X-lineFrom.X),(int)(lineTo.Y-lineFrom.Y));
        await RunPageCheck("underlineSaved", """
            await pause(200);await until(()=>document.body.innerText.includes('已自动保存'));
            """);
        Check("realUnderline",(await storage.ReadDocumentAsync(handle.DocHash)).Annotations.Any(a=>a.GetProperty("type").GetString()=="underline"));
        acceptanceResults["ok"]=true;await FinishAcceptanceAsync(acceptanceResults);
    }
    private async Task<System.Windows.Point> AnnotationScreenPointAsync(double x,double y)
    {
        var result=await web.CoreWebView2.ExecuteScriptAsync("(()=>{const r=document.querySelector('[data-page=\"1\"]').getBoundingClientRect(),p="+Json.String(new{x,y})+";return {x:r.left+r.width*p.x,y:r.top+r.height*p.y};})()");using var point=JsonDocument.Parse(result);return web.PointToScreen(new System.Windows.Point(point.RootElement.GetProperty("x").GetDouble(),point.RootElement.GetProperty("y").GetDouble()));
    }
}
