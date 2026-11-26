using DocAss.Host.Contracts;
using DocAss.Host.Verification;
using Microsoft.Web.WebView2.Core;

namespace DocAss.Host;

public sealed partial class MainWindow
{
    private async Task VerifyReadingAsync()
    {
        NativeInput.GetCursorPos(out originalCursor); originalForeground = NativeInput.GetForegroundWindow();
        Topmost = true; NativeInput.Activate(this); web.Focus(); await Task.Delay(400);
        var root = new DirectoryInfo(AppContext.BaseDirectory); while (root != null && !File.Exists(Path.Combine(root.FullName, "DocAss.sln"))) root = root.Parent;
        var fixture = Path.Combine(root!.FullName, "docs", "fixtures", "generated");
        await web.CoreWebView2.ExecuteScriptAsync("window.__readingErrors=[];window.addEventListener('error',e=>window.__readingErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__readingErrors.push(String(e.reason)));window.addEventListener('docass.renderError',e=>window.__readingErrors.push(JSON.stringify(e.detail)));");
        var opened = await files.OpenAsync(Path.Combine(fixture, "native-matrix.pdf")); Emit("doc.opened", opened);
        await RunPageCheck("realCanvas", """
            await until(()=>document.querySelector('[data-reader]'));await until(()=>document.querySelector('[data-page="1"] canvas[data-rendered]'));
            check(document.querySelector('[data-reader]').dataset.pageCount==='10','real page count');
            const canvas=document.querySelector('[data-page="1"] canvas[data-rendered]'),ctx=canvas.getContext('2d');
            const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let dark=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<100&&pixels[i+3]>0)dark++;
            check(dark>100,'PDF ink painted');window.__firstCanvas={width:canvas.width,height:canvas.height,dark};
            """);
        await RunPageCheck("nativeSearch", """
            button('查找').click();await until(()=>document.querySelector('input[placeholder="在文档中查找..."]'));
            setValue(document.querySelector('input[placeholder="在文档中查找..."]'),'中文');
            await until(()=>/已搜索 [1-9]/.test(document.querySelector('[data-testid="search-coverage"]').textContent));
            await until(()=>document.body.innerText.includes('1 / 40'));
            document.querySelector('button[title="下一个 (F3)"]').click();await pause(100);check(document.body.innerText.includes('2 / 40'),'next match');
            window.dispatchEvent(new KeyboardEvent('keydown',{key:'F3',shiftKey:true,bubbles:true}));await pause(50);check(document.body.innerText.includes('1 / 40'),'previous match');
            document.querySelector('button[title="关闭 (Esc)"]').click();button('适合整页').click();await pause(400);
            """);
        var raw = await geometry.ExtractAsync(opened.Handle!.DocId, 1, Guid.NewGuid().ToString());
        // Feed page coordinates from the real host extractor to pointer events in the
        // actual reader. The hit test still uses the production inverse viewport.
        var first = raw.Glyphs[0]; var third = raw.Glyphs[2];
        await web.CoreWebView2.ExecuteScriptAsync("window.__glyphProbe=" + Json.String(new { start = first.Quad, end = third.Quad, box = raw.PageInfo.PageBox }) + ";");
        await RunPageCheck("selectionOverlay", """
            const page=document.querySelector('[data-page="1"]'),r=page.getBoundingClientRect(),g=window.__glyphProbe;
            await until(()=>document.querySelector('[data-reader]').dataset.textPages.split(',').includes('1'));
            const x=q=>r.left+(q[0]-g.box[0])/(g.box[2]-g.box[0])*r.width;
            const y=q=>r.top+(g.box[3]-(q[1]+q[5])/2)/(g.box[3]-g.box[1])*r.height;
            const target=document.querySelector('[data-testid="reader-scroll"]');
            window.__pointerEvents=[];for(const name of ['pointerdown','pointerup','pointercancel'])target.addEventListener(name,e=>window.__pointerEvents.push({type:name,pointerId:e.pointerId,x:e.clientX,y:e.clientY,target:e.target.tagName}));
            // Capture requires a real active pointer; use native input below instead.
            window.__selectionPoints={x1:x(g.start)+1,y1:y(g.start),x2:x(g.end)+(g.end[2]-g.end[0])/(g.box[2]-g.box[0])*r.width-1,y2:y(g.end)};
            check(r.width>100,'page geometry');
            """);
        using (var points = System.Text.Json.JsonDocument.Parse(await web.CoreWebView2.ExecuteScriptAsync("window.__selectionPoints")))
        {
            NativeInput.Activate(this); web.Focus(); await Task.Delay(400);
            var p = points.RootElement; var from = web.PointToScreen(new System.Windows.Point(p.GetProperty("x1").GetDouble(), p.GetProperty("y1").GetDouble()));
            var to = web.PointToScreen(new System.Windows.Point(p.GetProperty("x2").GetDouble(), p.GetProperty("y2").GetDouble()));
            acceptanceResults["selectionScreenPoints"] = new { from, to, hitTest = NativeInput.HitTest(from), foreground = NativeInput.GetForegroundWindow().ToString(), window = new System.Windows.Interop.WindowInteropHelper(this).Handle.ToString() };
            await NativeInput.Drag(from, (int)(to.X - from.X), (int)(to.Y - from.Y));
        }
        acceptanceResults["pointerEvents"] = await web.CoreWebView2.ExecuteScriptAsync("JSON.stringify({points:window.__selectionPoints,events:window.__pointerEvents})");
        await RunPageCheck("nativeSelection", """
            await until(()=>button('复制选中文字'));const c=document.querySelector('[data-overlay="1"]'),data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
            let marked=0;for(let i=3;i<data.length;i+=4)if(data[i]>0)marked++;check(marked>20,'selection painted on glyph quads');
            button('复制选中文字').click();await pause(200);
            window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await until(()=>!button('复制选中文字'));
            """);
        Check("clipboardText", System.Windows.Clipboard.GetText() == "中文文");
        var wordPoint = await GlyphScreenPointAsync(raw, 0, false, 0); await NativeInput.Click(wordPoint, true);
        await RunPageCheck("doubleClickWord", """
            await until(()=>button('复制选中文字'));button('复制选中文字').click();await pause(200);
            """);
        Check("wordClipboardText", System.Windows.Clipboard.GetText() == "中文");
        await NativeInput.TripleClick(wordPoint);
        await RunPageCheck("tripleClickLine", """
            await until(()=>button('复制选中文字'));button('复制选中文字').click();await pause(200);
            """);
        Check("lineClipboardText", System.Windows.Clipboard.GetText() == "中文文档标注测试数据页面坐标验证");
        await NativeInput.DragAcrossLayout(wordPoint, async () =>
        {
            await RunPageCheck("pointerCancel", """
                const target=document.querySelector('[data-testid="reader-scroll"]'),id=window.__pointerEvents.findLast(e=>e.type==='pointerdown').pointerId;
                target.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:id}));await until(()=>!button('复制选中文字'));
                """); return wordPoint;
        });
        await RunPageCheck("rotateForSelection", """
            button('旋转').click();await pause(400);await until(()=>document.querySelector('[data-page="1"] canvas[data-rendered]'));
            """);
        var rotatedStart = await GlyphScreenPointAsync(raw, 0, false, 90); var rotatedEnd = await GlyphScreenPointAsync(raw, 2, true, 90);
        await NativeInput.Drag(rotatedStart, (int)(rotatedEnd.X - rotatedStart.X), (int)(rotatedEnd.Y - rotatedStart.Y));
        await RunPageCheck("rotatedSelection", """
            await until(()=>button('复制选中文字'));button('复制选中文字').click();await pause(200);
            """);
        Check("rotatedClipboardText", System.Windows.Clipboard.GetText() == "中文文");
        using (var screenshot = File.Create(Path.Combine(Path.GetDirectoryName(acceptance!.Output)!, "reading-rotated-selection.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, screenshot);
        await RunPageCheck("resetRotation", """
            window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));button('旋转').click();await pause(50);button('旋转').click();await pause(50);button('旋转').click();await pause(400);
            """);
        var sixth = await geometry.ExtractAsync(opened.Handle.DocId, 6, Guid.NewGuid().ToString());
        await NativeInput.DragAcrossLayout(await GlyphScreenPointAsync(raw, 0, false, 0), async () =>
        {
            await RunPageCheck("virtualSelectionBoundary", """
                const scroller=document.querySelector('[data-testid="reader-scroll"]');
                // Keep the native pointer captured while bringing a distant page
                // into view, forcing the selection's anchor canvas to unmount.
                scroller.scrollTop=scroller.scrollHeight*.56;await pause(100);
                await until(()=>document.querySelector('[data-page="6"]'));
                scroller.scrollTop+=document.querySelector('[data-page="6"]').getBoundingClientRect().top-scroller.getBoundingClientRect().top-20;
                await until(()=>document.querySelector('[data-reader]').dataset.textPages.split(',').includes('6'));await pause(300);
                check(!document.querySelector('[data-page="1"]'),'anchor page virtualized');
                """);
            return await GlyphScreenPointAsync(sixth, 2, true, 0);
        });
        await RunPageCheck("crossPageCopy", """
            await until(()=>button('复制选中文字'));button('复制选中文字').click();await pause(500);
            """);
        var crossPage = System.Windows.Clipboard.GetText();
        Check("crossPageClipboard", crossPage.StartsWith("中文文档") && crossPage.EndsWith(string.Concat(sixth.Glyphs.Take(3).Select(g => g.Text))) && crossPage.Length > 1000);
        await RunPageCheck("verticalPage", """
            window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('button[title="点击输入页码跳转"]').click();await pause(30);
            const input=document.querySelector('input[aria-label="页码"]');setValue(input,'9');await pause(30);input.closest('form').requestSubmit();
            await until(()=>document.querySelector('[data-page="9"] canvas[data-rendered]'));await until(()=>document.querySelector('[data-reader]').dataset.textPages.split(',').includes('9'));await pause(300);
            """);
        var vertical = await geometry.ExtractAsync(opened.Handle.DocId, 9, Guid.NewGuid().ToString());
        var verticalStart = await GlyphScreenPointAsync(vertical, 0, false, 0, true); var verticalEnd = await GlyphScreenPointAsync(vertical, 2, true, 0, true);
        await NativeInput.Drag(verticalStart, (int)(verticalEnd.X - verticalStart.X), (int)(verticalEnd.Y - verticalStart.Y));
        await RunPageCheck("verticalSelection", """
            await until(()=>button('复制选中文字'));button('复制选中文字').click();await pause(200);
            """);
        Check("verticalClipboardText", System.Windows.Clipboard.GetText() == "竖排文");
        using (var screenshot = File.Create(Path.Combine(Path.GetDirectoryName(acceptance!.Output)!, "reading-native.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, screenshot);
        var password = await files.OpenAsync(Path.Combine(fixture, "password.pdf")); Emit("doc.opened", password);
        await RunPageCheck("desktopPassword", """
            await until(()=>document.querySelector('[aria-label="文档密码"]'));setValue(document.querySelector('[aria-label="文档密码"]'),'wrong');await pause(30);button('解锁').click();
            await until(()=>document.body.innerText.includes('密码错误'));setValue(document.querySelector('[aria-label="文档密码"]'),'fixture-reader');await pause(30);button('解锁').click();
            await until(()=>!document.querySelector('[aria-label="PDF 密码"]'));await until(()=>document.querySelector('[data-reader]')?.dataset.pageCount==='1');await until(()=>document.querySelector('canvas[data-rendered]'));
            """);
        var large = await files.OpenAsync(Path.Combine(fixture, "performance-500.pdf")); Emit("doc.opened", large);
        await RunPageCheck("desktopVirtualization", """
            await until(()=>document.querySelector('[data-reader]')?.dataset.pageCount==='500');await until(()=>document.querySelector('canvas[data-rendered]'));
            check(document.querySelectorAll('canvas').length<20,'virtualized canvases');button('缩略图').click();await pause(600);check(document.querySelectorAll('canvas').length<30,'lazy thumbnails');
            check(window.__readingErrors.length===0,'no unhandled errors: '+window.__readingErrors.join(';'));
            """);
        acceptanceResults["ok"] = true; acceptanceResults["geometryGlyphs"] = raw.Glyphs.Length; acceptanceResults["snapshotHash"] = opened.Handle.DocHash;
        await FinishAcceptanceAsync(acceptanceResults);
    }
    private async Task<System.Windows.Point> GlyphScreenPointAsync(Documents.NativePageResult page, int index, bool after, int rotation, bool vertical = false)
    {
        var q = page.Glyphs[index].Quad; var b = page.PageInfo.PageBox;
        // Canonical quads start at the lowest vertex, which may be on either side of a tilted glyph.
        var left = new[] { q[0], q[2], q[4], q[6] }.Min(); var right = new[] { q[0], q[2], q[4], q[6] }.Max();
        var bottom = new[] { q[1], q[3], q[5], q[7] }.Min(); var top = new[] { q[1], q[3], q[5], q[7] }.Max();
        var u = (left + (right - left) * (after ? .85 : .15) - b[0]) / (b[2] - b[0]); var v = ((bottom + top) / 2 - b[1]) / (b[3] - b[1]);
        if (vertical) { u = ((left + right) / 2 - b[0]) / (b[2] - b[0]); v = (bottom + (top - bottom) * (after ? .15 : .85) - b[1]) / (b[3] - b[1]); }
        var (x, y) = ((rotation + page.PageInfo.Rotate) % 360) switch { 90 => (v, u), 180 => (1 - u, v), 270 => (1 - v, 1 - u), _ => (u, 1 - v) };
        var value = await web.CoreWebView2.ExecuteScriptAsync("(()=>{const r=document.querySelector('[data-page=\"" + page.PageInfo.Page + "\"]').getBoundingClientRect(),p=" + Json.String(new { x, y }) + ";return {x:r.left+r.width*p.x,y:r.top+r.height*p.y};})()");
        using var point = System.Text.Json.JsonDocument.Parse(value); return web.PointToScreen(new System.Windows.Point(point.RootElement.GetProperty("x").GetDouble(), point.RootElement.GetProperty("y").GetDouble()));
    }
}
