using System.Net;
using System.Text;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Verification;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Web.WebView2.Core;

namespace DocAss.Host;

public sealed partial class MainWindow
{
    private async Task VerifyLlmAsync()
    {
        NativeInput.GetCursorPos(out originalCursor); originalForeground = NativeInput.GetForegroundWindow(); Topmost = true; NativeInput.Activate(this); web.Focus();
        var root = new DirectoryInfo(AppContext.BaseDirectory); while (root != null && !File.Exists(Path.Combine(root.FullName, "DocAss.sln"))) root = root.Parent;
        using var fixtures = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(root!.FullName, "artifacts", "llm-protocols.json")));
        var received = new List<object>(); var disconnected = 0; var annotationMode = false;
        var builder = WebApplication.CreateSlimBuilder(); builder.Logging.ClearProviders(); builder.WebHost.ConfigureKestrel(o => o.Listen(IPAddress.Loopback, 0)); await using var upstream = builder.Build();
        upstream.Run(async context =>
        {
            var body = await new StreamReader(context.Request.Body).ReadToEndAsync(); var path = context.Request.Path.Value!;
            var api = path.Contains("chat/completions") ? "openai-completions" : path.Contains("responses") ? "openai-responses" : path.Contains("messages") ? "anthropic-messages" : "google-generative-ai";
            lock (received) received.Add(new { api, path, hasRealKey = context.Request.Headers.Authorization == "Bearer acceptance-fake-key" || context.Request.Headers["x-api-key"] == "acceptance-fake-key" || context.Request.Headers["x-goog-api-key"] == "acceptance-fake-key", leakedLocal = context.Request.Headers.ContainsKey("X-DocAss-Session"), bodyBytes = Encoding.UTF8.GetByteCount(body) });
            var isResult = body.Contains("tool_call_id") || body.Contains("tool_result") || body.Contains("functionResponse") || body.Contains("function_call_output");
            var stream = fixtures.RootElement.GetProperty(api).GetProperty(isResult || body.Contains("cancel-test") ? "text" : "tool").GetString()!;
            if (annotationMode)
            {
                using var request = JsonDocument.Parse(body); var toolResults = request.RootElement.GetProperty("messages").EnumerateArray().Where(m => m.GetProperty("role").GetString() == "tool").Select(m => m.GetProperty("content").GetString()!).ToArray();
                if (toolResults.Length == 0) stream = CompletionFixture(null, "search_document", new { query = "中文", maxHits = 2 });
                else { using var search = JsonDocument.Parse(toolResults[0]); var hit = search.RootElement.GetProperty("hits")[0]; var token = hit.GetProperty("anchorToken").GetString(); stream = toolResults.Length == 1 ? CompletionFixture(null, "create_annotation", new { page = 1, quote = "中文", type = "highlight", comment = "合成验收标注", anchorToken = token }) : CompletionFixture($"已创建标注 [[p1|中文|@{token}]]。伪造引用 [[p1|不存在的引文]]。", null, null); }
            }
            context.Response.ContentType = "text/event-stream";
            try { var bytes = Encoding.UTF8.GetBytes(stream); var size = (bytes.Length + 3) / 4; for (var offset = 0; offset < bytes.Length; offset += size) { await Task.Delay(250, context.RequestAborted); var end = Math.Min(bytes.Length, offset + size); for (var i = offset; i < end; i += 7) await context.Response.Body.WriteAsync(bytes.AsMemory(i, Math.Min(7, end - i)), context.RequestAborted); await context.Response.Body.FlushAsync(context.RequestAborted); } }
            catch (OperationCanceledException) { Interlocked.Increment(ref disconnected); }
        }); await upstream.StartAsync();
        var providerIds = new List<string>();
        foreach (var api in new[] { "openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai" }) { var id = Guid.NewGuid().ToString(); providerIds.Add(id); await settings.SaveProviderAsync(Json.Element(new { id, name = api, api, baseUrl = upstream.Urls.Single(), isDefault = providerIds.Count == 1, imageAllowed = true, models = new[] { new { modelId = "fixture", input = new[] { "text", "image" }, contextWindow = 131072, maxOutputTokens = 128 } }, hasKey = false }), "acceptance-fake-key"); }
        var opened = await files.OpenAsync(Path.Combine(root.FullName, "docs", "fixtures", "generated", "native-matrix.pdf")); Emit("doc.opened", opened);
        await RunPageCheck("llmWorkspace", """
            await until(()=>document.querySelector('[data-testid="live-chat"]'));button('适合整页').click();await until(()=>document.querySelector('[data-page="1"] canvas[data-rendered]'));
            window.llmUpdates=[];new MutationObserver(()=>{const t=document.querySelector('[data-testid="chat-messages"]')?.textContent??'';if(t!==window.lastLlmText){window.llmUpdates.push({at:performance.now(),text:t});window.lastLlmText=t;}}).observe(document.querySelector('[data-testid="chat-messages"]'),{subtree:true,childList:true,characterData:true});
            """, 10000);
        for (var i = 0; i < providerIds.Count; i++)
        {
            await RunPageCheck("adapter" + i, """
                const set=(el,value)=>{Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLTextAreaElement?'input':'change',{bubbles:true}));};
                button('＋新建').click();await pause(200);const select=document.querySelector('[aria-label="对话模型"]');set(select,
                """ + Json.String(providerIds[i] + "/fixture") + """
                );await pause(200);set(document.querySelector('[aria-label="文档问题"]'),'请使用工具查看文档');await pause(100);button('发送').click();await until(()=>button('停止')||button('取消排队'));await until(()=>!button('停止')&&!button('取消排队')&&!button('正在停止'));check(document.querySelector('[data-testid="chat-messages"]').textContent.includes('中文流式验收完成'),'real model text');check(document.querySelector('[data-testid="chat-messages"]').textContent.includes('读取文档信息'),'real tool record');
                """, 20000);
        }
        var updates = await web.CoreWebView2.ExecuteScriptAsync("window.llmUpdates.filter(x=>x.text.includes('中文')&&!x.text.includes('验收完成')).length"); Check("incrementalUiBeforeEnd", int.Parse(updates) >= 2);
        await RunPageCheck("stopLlm", """
            const input=document.querySelector('[aria-label="文档问题"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'cancel-test');input.dispatchEvent(new Event('input',{bubbles:true}));await pause(80);button('发送').click();await until(()=>button('停止'));await pause(400);const t=performance.now();button('停止').click();await pause(20);check(!button('停止'),'stop feedback');window.llmStopMs=performance.now()-t;window.llmStopped=document.querySelector('[data-testid="chat-messages"]').textContent;await pause(1200);check(!document.querySelector('[data-testid="chat-messages"]').textContent.endsWith('late'),'no late output');
            """, 10000);
        Check("upstreamDisconnect", Volatile.Read(ref disconnected) > 0); acceptanceResults["stopFeedbackMs"] = JsonDocument.Parse(await web.CoreWebView2.ExecuteScriptAsync("window.llmStopMs")).RootElement.GetDouble();
        var before = received.Count;
        var geometryPage = await geometry.ExtractAsync(opened.Handle!.DocId, 1, Guid.NewGuid().ToString()); var selectionStart = await GlyphScreenPointAsync(geometryPage, 0, false, 0); var selectionEnd = await GlyphScreenPointAsync(geometryPage, 1, true, 0); await NativeInput.Drag(selectionStart, (int)(selectionEnd.X - selectionStart.X), (int)(selectionEnd.Y - selectionStart.Y));
        await RunPageCheck("textAskDraft", """
            await until(()=>button('问 AI'));button('问 AI').click();await until(()=>document.querySelector('[aria-label="移除引用 1"]'));document.querySelector('[aria-label="移除引用 1"]').click();
            """); Check("textAskDidNotSend", received.Count == before);
        await RunPageCheck("regionBegin", """
            button('框选问 AI').click();await until(()=>document.querySelector('[data-testid="region-selection"]'));await pause(100);
            """);
        var point = await AnnotationScreenPointAsync(.15, .25); await NativeInput.Drag(point, 90, 65);
        await RunPageCheck("regionAttachment", """
            await until(()=>button('问 AI'));check(document.querySelectorAll('[data-handle]').length===8,'eight handles');button('问 AI').click();await until(()=>document.querySelector('[aria-label="移除附件"]'));await until(()=>Array.from(document.querySelectorAll('img[alt="消息附件"]')).some(i=>i.complete&&i.naturalWidth>0));
            """, 10000);
        Check("draftDidNotSend", received.Count == before);
        using (var screenshot = File.Create(Path.Combine(Path.GetDirectoryName(acceptance!.Output)!, "llm-chat-region.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, screenshot);
        await RunPageCheck("sendImageAttachment", """
            const input=document.querySelector('[aria-label="文档问题"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'请描述区域图像');input.dispatchEvent(new Event('input',{bubbles:true}));await pause(100);button('发送').click();await until(()=>button('停止')||button('取消排队'));await until(()=>!button('停止')&&!button('取消排队')&&!button('正在停止'));check(Array.from(document.querySelectorAll('[data-message] img')).some(i=>i.complete&&i.naturalWidth>0),'persisted real attachment');
            """, 15000);
        var attachmentConversation = (await storage.ReadDocumentAsync(opened.Handle.DocHash)).Messages.First(m => m.GetProperty("content").EnumerateArray().Any(b => b.GetProperty("type").GetString() == "attachment")).GetProperty("conversationId").GetString();
        annotationMode = true;
        await RunPageCheck("annotationAgent", """
            button('＋新建').click();await pause(200);const select=document.querySelector('[aria-label="对话模型"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,
            """ + Json.String(providerIds[0] + "/fixture") + """
            );select.dispatchEvent(new Event('change',{bubbles:true}));await pause(200);const input=document.querySelector('[aria-label="文档问题"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'请搜索中文并创建一处高亮');input.dispatchEvent(new Event('input',{bubbles:true}));await pause(100);button('发送').click();await until(()=>button('停止')||button('取消排队'));await until(()=>!button('停止')&&!button('取消排队')&&!button('正在停止'));check(!!button('撤销这组标注'),'persisted AI annotation result');
            """, 20000);
        var annotated = await storage.ReadDocumentAsync(opened.Handle!.DocHash); Check("aiAnnotationCommitted", annotated.Annotations.Length == 1 && annotated.Annotations[0].TryGetProperty("llmRef", out _));
        await RunPageCheck("citationAndBacklink", """
            button('中文').click();await until(()=>document.querySelector('canvas[data-current-count]')?.dataset.currentCount!=='0');button('不存在的引文').click();await until(()=>document.body.innerText.includes('原文位置未确认'));check(Array.from(document.querySelectorAll('canvas[data-current-count]')).every(c=>c.dataset.currentCount==='0'),'forged citation has no precise highlight');button('跳转标注').click();await until(()=>button('查看来源消息'));button('查看来源消息').click();await pause(100);
            """, 10000);
        using (var screenshot = File.Create(Path.Combine(Path.GetDirectoryName(acceptance!.Output)!, "llm-citations.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, screenshot);
        await RunPageCheck("undoAiGroup", """
            button('撤销这组标注').click();await pause(150);await until(()=>button('标注已删除'));check(document.body.innerText.includes('搜索文档'),'tool transcript retained');
            """); Check("undoAiPersisted", (await storage.ReadDocumentAsync(opened.Handle.DocHash)).Annotations.Length == 0);
        var snapshot = await storage.ReadDocumentAsync(opened.Handle!.DocHash); Check("fiveConversationsSaved", snapshot.Conversations.Length == 5 && snapshot.Messages.Length >= 22); Check("noBase64Transcript", snapshot.Messages.All(m => !m.GetRawText().Contains("base64"))); Check("messagesStableIds", snapshot.Messages.Select(m => m.GetProperty("id").GetString()).Distinct().Count() == snapshot.Messages.Length);
        await RunPageCheck("reopenChat", """
            document.querySelector('button[title="关闭标签页 (Ctrl+W)"]').click();await until(()=>!document.querySelector('[data-reader]'));button('native-matrix.pdf').click();await until(()=>document.querySelector('[data-testid="live-chat"]'));await until(()=>document.querySelectorAll('[data-message]').length>0);check(document.querySelector('[aria-label="对话模型"]').value.includes('fixture'),'model restored');
            """, 10000);
        await RunPageCheck("attachmentRestored", """
            document.querySelector('[data-testid="live-chat"] header button').click();await until(()=>document.querySelector('[aria-label="选择会话"]'));const select=document.querySelector('[aria-label="选择会话"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,
            """ + Json.String(attachmentConversation!) + """
            );select.dispatchEvent(new Event('change',{bubbles:true}));await until(()=>Array.from(document.querySelectorAll('[data-message] img')).some(i=>i.complete&&i.naturalWidth>0));check(document.querySelector('[aria-label="对话模型"]').value.includes(
            """ + Json.String(providerIds[3]) + """
            ),'conversation model synchronized');
            """, 10000);
        acceptanceResults["upstreamRequests"] = received; acceptanceResults["ok"] = true; await FinishAcceptanceAsync(acceptanceResults);
    }
    private static string CompletionFixture(string? text, string? name, object? args)
    {
        object delta = name == null ? new { content = text } : new { tool_calls = new[] { new { index = 0, id = "call_" + name, type = "function", function = new { name, arguments = Json.String(args!) } } } };
        return "data: " + Json.String(new { choices = new[] { new { index = 0, delta, finish_reason = (string?)null } } }) + "\n\ndata: " + Json.String(new { choices = new[] { new { index = 0, delta = new { }, finish_reason = name == null ? "stop" : "tool_calls" } }, usage = new { prompt_tokens = 20, completion_tokens = 10 } }) + "\n\ndata: [DONE]\n\n";
    }
}
