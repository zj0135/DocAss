using System.Text.Json;
using System.Windows;
using DocAss.Host.Contracts;
using DocAss.Host.Verification;
namespace DocAss.Host;

public sealed partial class MainWindow
{
    private async Task VerifyOcrAsync()
    {
        NativeInput.GetCursorPos(out originalCursor); originalForeground = NativeInput.GetForegroundWindow(); Topmost = true; NativeInput.Activate(this); web.Focus();
        var root = new DirectoryInfo(AppContext.BaseDirectory); while (root != null && !File.Exists(Path.Combine(root.FullName, "DocAss.sln"))) root = root.Parent;
        var configured = await settings.GetAsync(); var fields = configured.EnumerateObject().ToDictionary(p => p.Name, p => p.Value); fields["ocr"] = Json.Element(new { modelTier = "Small", backend = "Cpu", cacheMiB = 512 }); await settings.UpdateAsync(Json.Element(fields));
        await web.CoreWebView2.ExecuteScriptAsync("window.__ocrColdStart=performance.now()");
        var opened = await files.OpenAsync(Path.Combine(root!.FullName, "docs/fixtures/generated/ocr-reading.pdf")); Emit("doc.opened", opened);
        await RunPageCheck("ocrVisiblePage", """
            await until(()=>document.querySelector('[data-reader]'));button('适合整页').click();await until(()=>document.querySelector('[aria-label="文字识别控制"]')?.innerText.includes('文字来源：OCR'));await until(()=>document.querySelector('[data-page="1"] canvas[data-rendered]'));window.__ocrColdMs=performance.now()-window.__ocrColdStart;
            button('查找').click();await pause(100);const input=document.querySelector('input[placeholder*="查找"]')||document.querySelector('input[placeholder*="搜索"]');check(!!input,'find input');setValue(input,'assistant');await pause(400);await until(()=>document.querySelector('[data-testid="search-coverage"]')?.innerText.match(/已搜索 [12]\/3/));
            """, 30000);
        OcrResult Saved() => Directory.GetFiles(Path.Combine(dataDirectory, "ocr-cache"), "*.json").Select(p => JsonDocument.Parse(File.ReadAllBytes(p)).RootElement.GetProperty("result").Deserialize<OcrResult>(Json.Options)!).First(r => r.ContentRevision == opened.Handle!.DocHash && r.Raster.PageInfo.Page == 1);
        var recognized = Saved(); acceptanceResults["coldVisibleFullPathMs"] = JsonDocument.Parse(await web.CoreWebView2.ExecuteScriptAsync("window.__ocrColdMs")).RootElement.GetDouble(); acceptanceResults["coldEngineMs"] = recognized.ElapsedMs; Check("realEngineText", recognized.Lines.Any(l => l.Text.Contains("Document assistant"))); Check("offscreen200Dpi", Math.Abs(recognized.Raster.Dpi - 200) < .01);
        var raw = new Documents.NativePageResult(opened.Handle!.DocId, Guid.NewGuid().ToString(), opened.Handle.DocHash, 0, "ready", recognized.Raster.PageInfo, recognized.Lines[0].Glyphs, recognized.Profile.Fingerprint, null);
        await RunPageCheck("ocrPrepareSelection", """
            document.querySelector('button[title="关闭 (Esc)"]')?.click();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause(300);
            """);
        var from = await GlyphScreenPointAsync(raw, 0, false, 0); var to = await GlyphScreenPointAsync(raw, 7, true, 0); await NativeInput.Drag(from, (int)(to.X - from.X), (int)(to.Y - from.Y));
        await RunPageCheck("ocrCopyHighlight", """
            await until(()=>button('复制选中文字'));button('复制选中文字').click();await pause(150);button('高亮选中文字').click();await until(()=>document.body.innerText.includes('已自动保存'));
            """, 10000);
        acceptanceResults["ocrCopiedText"] = Clipboard.GetText(); Check("ocrClipboard", Clipboard.GetText() == "Document"); var saved = await storage.ReadDocumentAsync(opened.Handle.DocHash); Check("ocrHighlight", saved.Annotations.Length == 1 && saved.Annotations[0].GetProperty("textAnchor").GetProperty("source").GetString() == "ocr");
        var quads = saved.Annotations[0].GetProperty("quads").GetRawText(); var before = ocr.InferenceCount;
        await RunPageCheck("ocrReopenCache", """
            document.querySelector('button[title="关闭标签页 (Ctrl+W)"]').click();await until(()=>!document.querySelector('[data-reader]'));button('ocr-reading.pdf').click();await until(()=>document.querySelector('[aria-label="文字识别控制"]')?.innerText.includes('缓存命中'));
            """, 15000); Check("reopenNoInference", ocr.InferenceCount == before);
        await RunPageCheck("ocrWholeDocument", """
            button('识别全文').click();await until(()=>document.querySelector('[data-testid="ocr-coverage"]')?.innerText.includes('文字就绪 3/3'));button('查找').click();await pause(100);const input=document.querySelector('input[placeholder*="查找"]')||document.querySelector('input[placeholder*="搜索"]');setValue(input,'assistant');await until(()=>document.querySelector('[data-testid="search-coverage"]')?.innerText.includes('已搜索 3/3'));
            """, 30000);
        Check("highlightStableAfterOcr", (await storage.ReadDocumentAsync(opened.Handle.DocHash)).Annotations[0].GetProperty("quads").GetRawText() == quads);
        await RunPageCheck("ocrHybridHeader", """
            const input=document.querySelector('input[placeholder*="查找"]');setValue(input,'42');await until(()=>input.parentElement.querySelector('span')?.innerText==='1 / 1');
            document.querySelector('button[title="点击输入页码跳转"]').click();await until(()=>document.querySelector('input[aria-label="页码"]'));const page=document.querySelector('input[aria-label="页码"]');setValue(page,'2');await pause(50);page.form.requestSubmit();await until(()=>document.querySelector('[aria-label="文字识别控制"]')?.innerText.includes('文字来源：混合'));
            setValue(input,'assistant');await until(()=>input.parentElement.querySelector('span')?.innerText==='1 / 12');await until(()=>document.querySelector('[aria-label="文字识别控制"]')?.innerText.includes('文字来源：OCR'));
            """, 10000);
        if (acceptance!.Scenario == "ocrBenchmark")
        {
            await RunPageCheck("ocrWarmBenchmark", """
                document.querySelector('button[title="关闭 (Esc)"]')?.click();await pause(100);window.__ocrWarm=[];
                for(let i=0;i<30;i++){const start=performance.now();button('重新识别本页').click();await until(()=>button('取消识别等待'));await until(()=>!button('取消识别等待'));check(!document.querySelector('[aria-label="文字识别控制"] [role="alert"]'),'benchmark page succeeded');window.__ocrWarm.push(performance.now()-start);}
                """, 120000);
            var times = JsonDocument.Parse(await web.CoreWebView2.ExecuteScriptAsync("window.__ocrWarm")).RootElement.EnumerateArray().Select(v => v.GetDouble()).ToArray(); var p95 = times.Order().ElementAt(28); acceptanceResults["warmFullPathMs"] = times; acceptanceResults["p95Ms"] = p95; Check("g5LatencyPassed", p95 <= 1500);
        }
        else
        {
            var geometryDoc = await files.OpenAsync(Path.Combine(root.FullName, "docs/fixtures/generated/ocr-geometry.pdf")); Emit("doc.opened", geometryDoc);
            await RunPageCheck("ocrGeometryDocument", """
                await until(()=>document.querySelector('[data-reader]')?.dataset.pageCount==='4');button('适合整页').click();button('识别全文').click();await until(()=>document.querySelector('[data-testid="ocr-coverage"]')?.innerText.includes('文字就绪 4/4')||document.querySelector('[aria-label="文字识别控制"] [role="alert"]'));check(!document.querySelector('[aria-label="文字识别控制"] [role="alert"]'),document.querySelector('[aria-label="文字识别控制"]')?.innerText);
                """, 60000);
            var geometries = Directory.GetFiles(Path.Combine(dataDirectory, "ocr-cache"), "*.json").Select(p => JsonDocument.Parse(File.ReadAllBytes(p)).RootElement.GetProperty("result").Deserialize<OcrResult>(Json.Options)!).Where(r => r.ContentRevision == geometryDoc.Handle!.DocHash).OrderBy(r => r.Raster.PageInfo.Page).ToArray();
            Check("ocrRotateCropUserUnitAndBudget", geometries.Length == 4 && geometries.All(r => r.Raster.Width * r.Raster.Height <= 12_000_000) && geometries[3].Raster.Dpi < 200 && geometries.Take(3).All(r => r.Lines.Any(l => l.Text.Contains("Document"))));
            acceptanceResults["geometryProfiles"] = geometries.Select(r => new { r.Raster, r.Profile.Fingerprint, characters = r.Lines.Sum(l => l.Glyphs.Length) }).ToArray();
        }
        acceptanceResults["inferenceCount"] = ocr.InferenceCount; acceptanceResults["ok"] = true; await FinishAcceptanceAsync(acceptanceResults);
    }
}
