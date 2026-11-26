using System.Net;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Verification;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
namespace DocAss.Host;
public sealed partial class MainWindow
{
    private async Task VerifyAgentIntegrationAsync()
    {
        NativeInput.GetCursorPos(out originalCursor);originalForeground=NativeInput.GetForegroundWindow();Topmost=true;NativeInput.Activate(this);web.Focus();
        var root=new DirectoryInfo(AppContext.BaseDirectory);while(root!=null&&!File.Exists(Path.Combine(root.FullName,"DocAss.sln")))root=root.Parent;var fixture=Path.Combine(root!.FullName,"docs/fixtures/generated");
        var builder=WebApplication.CreateSlimBuilder();builder.Logging.ClearProviders();builder.WebHost.ConfigureKestrel(o=>o.Listen(IPAddress.Loopback,0));await using var upstream=builder.Build();var requests=0;var coverage=new List<JsonElement>();
        upstream.Run(async context=>{using var body=await JsonDocument.ParseAsync(context.Request.Body);Interlocked.Increment(ref requests);var messages=body.RootElement.GetProperty("messages").EnumerateArray().ToArray();var tool=messages.LastOrDefault(m=>m.GetProperty("role").GetString()=="tool");string response;if(tool.ValueKind==JsonValueKind.Undefined)response=CompletionFixture(null,"get_page_text",new{from=300,to=300,maxChars=body.RootElement.GetRawText().Contains("integration-scanned-300.pdf")?"Document assistant verification sample.".Length:20000});else{using var content=JsonDocument.Parse(tool.GetProperty("content").GetString()!);coverage.Add(content.RootElement.GetProperty("coverage").Clone());var page=content.RootElement.GetProperty("pages")[0];var native=page.GetProperty("text").GetString()!.Contains("REFERENCE-300");var quote=native?"REFERENCE-300":page.GetProperty("text").GetString()+"|@"+page.GetProperty("anchorToken").GetString();response=CompletionFixture($"已读取第300页；覆盖范围以工具记录为准 [[p300|{quote}]]",null,null);}context.Response.ContentType="text/event-stream";await context.Response.WriteAsync(response,context.RequestAborted);});await upstream.StartAsync();
        var providerId=Guid.NewGuid().ToString();await settings.SaveProviderAsync(Json.Element(new{id=providerId,name="Integration synthetic",api="openai-completions",baseUrl=upstream.Urls.Single(),isDefault=true,imageAllowed=false,models=new[]{new{modelId="fixture",input=new[]{"text"},contextWindow=65536,maxOutputTokens=256}},hasKey=false}));
        var hashes=new HashSet<string>();
        for(var i=1;i<=10;i++){var result=await files.OpenAsync(Path.Combine(fixture,$"tab-{i}.pdf"));hashes.Add(result.Handle!.DocHash);Emit("doc.opened",result);await RunPageCheck("tab"+i,"await until(()=>document.querySelector('[data-reader]')?.dataset.docHash==="+Json.String(result.Handle.DocHash)+");check(window.__docassResources.activeDocuments<=3,'active PDF cap');",10000);}
        Check("tenUniqueDocuments",hashes.Count==10);
        await RunPageCheck("tenTabRotation","""
            for(let round=0;round<2;round++)for(let n=1;n<=10;n++){const tab=Array.from(document.querySelectorAll('[title]')).find(e=>e.textContent==='tab-'+n+'.pdf');const label=Array.from(document.querySelectorAll('span')).find(e=>e.textContent==='tab-'+n+'.pdf');(tab||label).click();await pause(150);await until(()=>document.querySelector('[data-reader]'));check(window.__docassResources.activeDocuments<=3,'bounded wake');}
            """,30000);
        foreach(var name in new[]{"integration-300.pdf","integration-scanned-300.pdf"})
        {
            var result=await files.OpenAsync(Path.Combine(fixture,name));Emit("doc.opened",result);await RunPageCheck(name,"""
                await until(()=>document.querySelector('[data-reader]')?.dataset.docHash===
                """+Json.String(result.Handle!.DocHash)+"""
                );const input=document.querySelector('[aria-label="文档问题"]');setValue(input,'请读取第300页并引用原文');await pause(50);button('发送').click();await until(()=>button('停止')||button('取消排队'));await until(()=>!button('停止')&&!button('取消排队'));check(document.querySelector('[data-testid="chat-messages"]').textContent.includes('已读取第300页'),'300 page answer');check(window.__docassResources.activeDocuments<=3,'bounded tools');const cite=Array.from(document.querySelectorAll('[data-testid="chat-messages"] button')).find(b=>b.textContent.includes('REFERENCE-300')||b.textContent==='Document assistant verification sample.');check(!!cite,'traceable citation');cite.click();await until(()=>document.querySelector('[data-reader]').dataset.currentPage==='300');await until(()=>Array.from(document.querySelectorAll('canvas[data-current-count]')).some(c=>Number(c.dataset.currentCount)>0));
                """,45000);
        }
        acceptanceResults["coverage"]=coverage;Check("partialCoverageHonest",coverage.Count==2&&coverage.All(c=>c.GetProperty("total").GetInt32()==300&&c.GetProperty("ready").GetInt32()<300));acceptanceResults["requestCount"]=requests;acceptanceResults["realNetwork"]="not tested by synthetic scenario: run --verify-provider-smoke against the configured workspace";acceptanceResults["syntheticPassed"]=true;acceptanceResults["ok"]=true;await FinishAcceptanceAsync(acceptanceResults);
    }
}
