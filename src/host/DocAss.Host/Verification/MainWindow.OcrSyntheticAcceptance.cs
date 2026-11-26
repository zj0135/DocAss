using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using System.Windows;
using DocAss.Host.Contracts;
using DocAss.Host.Verification;
using Microsoft.Web.WebView2.Core;

namespace DocAss.Host;
public sealed partial class MainWindow
{
    private async Task VerifyOcrSyntheticAsync()
    {
        NativeInput.GetCursorPos(out originalCursor);originalForeground=NativeInput.GetForegroundWindow();Topmost=true;NativeInput.Activate(this);web.Focus();
        var root=new DirectoryInfo(AppContext.BaseDirectory);while(root!=null&&!File.Exists(Path.Combine(root.FullName,"DocAss.sln")))root=root.Parent;
        var sampleRoot=Path.Combine(root!.FullName,"docs/fixtures/generated");var outputRoot=Path.GetDirectoryName(acceptance!.Output)!;
        var truth=JsonSerializer.Deserialize<OcrTruthCorpus>(File.ReadAllText(Path.Combine(sampleRoot,"ocr-synthetic-truth.json")),Json.Options)!;
        var configured=(await settings.GetAsync()).EnumerateObject().ToDictionary(p=>p.Name,p=>p.Value);configured["ocr"]=Json.Element(new{modelTier="Small",backend="Cpu",cacheMiB=512});await settings.UpdateAsync(Json.Element(configured));
        var cold=Stopwatch.StartNew();var opened=await files.OpenAsync(Path.Combine(sampleRoot,"ocr-acceptance.pdf"));Emit("doc.opened",opened);
        await RunPageCheck("syntheticFirstPage","""
            await until(()=>document.querySelector('[data-reader]')?.dataset.pageCount==='3');button('适合整页').click();await until(()=>document.querySelector('[aria-label="文字识别控制"]')?.innerText.includes('文字来源：OCR'));await until(()=>document.querySelector('[data-page="1"] canvas[data-rendered]'));
            """,30000);
        acceptanceResults["coldFirstPageFullPathMs"]=cold.Elapsed.TotalMilliseconds;
        await RunPageCheck("syntheticWholeDocument","""
            button('识别全文').click();await until(()=>document.querySelector('[data-testid="ocr-coverage"]')?.innerText.includes('文字就绪 3/3')||document.querySelector('[aria-label="文字识别控制"] [role="alert"]'));check(!document.querySelector('[aria-label="文字识别控制"] [role="alert"]'),'all synthetic pages succeeded');
            """,60000);
        var results=Directory.GetFiles(Path.Combine(dataDirectory,"ocr-cache"),"*.json").Select(p=>JsonSerializer.Deserialize<OcrResult>(JsonDocument.Parse(File.ReadAllBytes(p)).RootElement.GetProperty("result"),Json.Options)!).Where(r=>r.ContentRevision==opened.Handle!.DocHash).OrderBy(r=>r.Raster.PageInfo.Page).ToArray();
        Check("threeScannedPages",results.Length==3);var scores=new List<OcrGeometryScore>();
        foreach(var page in truth.Pages)
        {
            Check("imageHash"+page.Page,Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Path.Combine(sampleRoot,page.Image))))==page.ImageHash);
            var native=await geometry.ExtractAsync(opened.Handle!.DocId,page.Page,Guid.NewGuid().ToString(),default);Check("noNativeText"+page.Page,native.Glyphs.Length==0);
            var result=results.Single(r=>r.Raster.PageInfo.Page==page.Page);scores.Add(OcrGeometryAcceptance.Score(truth,page,result));
            File.WriteAllText(Path.Combine(outputRoot,page.Category+"-result.json"),Json.String(result));OcrGeometryAcceptance.Overlay(sampleRoot,Path.Combine(outputRoot,page.Category+"-overlay.svg"),truth,page,result);
        }
        var total=scores.Sum(s=>s.Expected);var hits=scores.Sum(s=>s.Hits);acceptanceResults["syntheticGeometry"]=new{provenance=truth.Provenance,total,hits,hitRate=(double)hits/total,pages=scores};
        acceptanceResults["pdfHash"]=opened.Handle!.DocHash;Check("syntheticCenterThreshold",total>=100&&(double)hits/total>=.95);
        foreach(var page in new[]{1,3})
        {
            await RunPageCheck("syntheticNavigate"+page,"""
                window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('button[title="点击输入页码跳转"]').click();await until(()=>document.querySelector('input[aria-label="页码"]'));const input=document.querySelector('input[aria-label="页码"]');
                """+"setValue(input,'"+page+"');await pause(50);input.form.requestSubmit();await pause(350);"+"await until(()=>document.querySelector('[data-page=\""+page+"\"] canvas[data-rendered]'));" );
            var result=results.Single(r=>r.Raster.PageInfo.Page==page);var line=page==1?result.Lines.First(l=>l.Text.StartsWith("Document")):result.Lines.First(l=>l.Text.StartsWith("本地文字"));
            var raw=new Documents.NativePageResult(opened.Handle.DocId,Guid.NewGuid().ToString(),opened.Handle.DocHash,0,"ready",result.Raster.PageInfo,line.Glyphs,result.Profile.Fingerprint,null);
            var from=await GlyphScreenPointAsync(raw,0,false,0,page==3);var to=await GlyphScreenPointAsync(raw,page==1?7:3,true,0,page==3);await NativeInput.Drag(from,(int)(to.X-from.X),(int)(to.Y-from.Y));
            await RunPageCheck("syntheticCopyHighlight"+page,"""
                await until(()=>button('复制选中文字'));button('复制选中文字').click();await pause(200);button('高亮选中文字').click();await until(()=>document.body.innerText.includes('已自动保存'));
                """);
            acceptanceResults["copiedPage"+page]=Clipboard.GetText();Check("copyMatches"+page,Clipboard.GetText()==(page==1?"Document":"本地文字"));
            using var screenshot=File.Create(Path.Combine(outputRoot,$"synthetic-page{page}-highlight.png"));await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,screenshot);
        }
        var before=await storage.ReadDocumentAsync(opened.Handle.DocHash);Check("twoOcrHighlights",before.Annotations.Length==2&&before.Annotations.All(a=>a.GetProperty("textAnchor").GetProperty("source").GetString()=="ocr"));
        await RunPageCheck("syntheticSearch","""
            button('查找').click();await until(()=>document.querySelector('input[placeholder*="查找"]'));const input=document.querySelector('input[placeholder*="查找"]');setValue(input,'本地文字');await until(()=>document.querySelector('[data-testid="search-coverage"]')?.innerText.includes('已搜索 3/3'));await until(()=>input.parentElement.querySelector('span')?.innerText==='1 / 2');document.querySelector('button[title="关闭 (Esc)"]').click();
            document.querySelector('button[title="点击输入页码跳转"]').click();await until(()=>document.querySelector('input[aria-label="页码"]'));const number=document.querySelector('input[aria-label="页码"]');setValue(number,'3');await pause(50);number.form.requestSubmit();await pause(300);
            """);
        await RunPageCheck("syntheticRotate","""
            button('旋转').click();await pause(600);await until(()=>document.querySelector('[data-page="3"] canvas[data-rendered]'));
            """);
        using(var screenshot=File.Create(Path.Combine(outputRoot,"synthetic-vertical-rotated.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,screenshot);
        var runs=ocr.InferenceCount;
        await RunPageCheck("syntheticReopen","""
            document.querySelector('button[title="关闭标签页 (Ctrl+W)"]').click();await until(()=>!document.querySelector('[data-reader]'));button('ocr-acceptance.pdf').click();await until(()=>document.querySelector('[aria-label="文字识别控制"]')?.innerText.includes('缓存命中'));
            """,15000);
        var after=await storage.ReadDocumentAsync(opened.Handle.DocHash);Check("persistedSyntheticQuads",before.Annotations.Select(a=>a.GetProperty("quads").GetRawText()).SequenceEqual(after.Annotations.Select(a=>a.GetProperty("quads").GetRawText())));Check("reopenZeroInference",ocr.InferenceCount==runs);
        acceptanceResults["inferenceCount"]=ocr.InferenceCount;acceptanceResults["ok"]=true;await FinishAcceptanceAsync(acceptanceResults);
    }
}
