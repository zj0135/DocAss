using System.Net;
using System.Text;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Http;
using DocAss.Host.Settings;
using DocAss.Host.Storage;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Xunit;

namespace DocAss.Host.Tests;
public class LlmTests
{
    private static JsonElement Provider(string api,string origin,bool image=true,bool vision=true,string? id=null)=>Json.Element(new {id=id??Guid.NewGuid().ToString(),name="Synthetic",api,baseUrl=origin,isDefault=true,imageAllowed=image,models=new[]{new{modelId="fixture",input=vision?new[]{"text","image"}:new[]{"text"},contextWindow=32768,maxOutputTokens=128}},hasKey=false});
    private static async Task<WebApplication> Server(RequestDelegate action){var builder=WebApplication.CreateSlimBuilder();builder.Logging.ClearProviders();builder.WebHost.ConfigureKestrel(o=>o.Listen(IPAddress.Loopback,0));var app=builder.Build();app.Run(action);await app.StartAsync();return app;}
    private static string TempDb()=>Path.Combine(Path.GetTempPath(),"DocAss-llm-tests",Guid.NewGuid().ToString(),"workspace.db");
    [Theory][InlineData("openai-completions","chat/completions","Authorization")][InlineData("openai-responses","responses","Authorization")][InlineData("anthropic-messages","v1/messages","x-api-key")][InlineData("google-generative-ai","models/fixture:streamGenerateContent?alt=sse","x-goog-api-key")]
    public async Task FourRestrictedProxiesStripClientCredentialsAndStream(string api,string suffix,string auth)
    {
        var received=new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var upstream=await Server(async c=>{received.TrySetResult(Json.Element(new {auth=c.Request.Headers[auth].ToString(),local=c.Request.Headers["X-DocAss-Session"].ToString(),cookie=c.Request.Headers.Cookie.ToString(),path=c.Request.Path.Value,body=await new StreamReader(c.Request.Body).ReadToEndAsync()}));c.Response.ContentType="text/event-stream";await c.Response.WriteAsync("data: {\"text\":\"中\"}\n\n");await c.Response.Body.FlushAsync();await Task.Delay(30);await c.Response.WriteAsync("data: [DONE]\n\n");});
        await using var storage=new StorageService(TempDb());await storage.InitializeAsync();var settings=new SettingsService(storage);var p=Provider(api,upstream.Urls.Single());await settings.SaveProviderAsync(p,"server-only-sentinel");using var proxy=new ProviderProxy(settings);var run=Guid.NewGuid().ToString();await proxy.BeginAsync(p.GetProperty("id").GetString()!,"fixture",run);await using var loopback=new LoopbackServer(MainWindow.PublishedOrigin,providers:proxy);await loopback.StartAsync();
        using var client=new HttpClient();using var request=new HttpRequestMessage(HttpMethod.Post,loopback.Origin+"/llm/"+run+"/"+suffix);request.Headers.Add("Origin",MainWindow.PublishedOrigin);request.Headers.Add("X-DocAss-Session",loopback.SessionToken);request.Headers.Add("X-Request-Id",Guid.NewGuid().ToString());request.Headers.Add("Authorization","Bearer browser-fake");request.Headers.Add("x-api-key","browser-fake");request.Headers.Add("Cookie","secret=fake");request.Content=new StringContent("{\"model\":\"fixture\"}",Encoding.UTF8,"application/json");
        using var response=await client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead);Assert.Equal(HttpStatusCode.OK,response.StatusCode);Assert.Contains("[DONE]",await response.Content.ReadAsStringAsync());var value=await received.Task;Assert.Equal(auth=="Authorization"?"Bearer server-only-sentinel":"server-only-sentinel",value.GetProperty("auth").GetString());Assert.Equal("",value.GetProperty("local").GetString());Assert.Equal("",value.GetProperty("cookie").GetString());Assert.DoesNotContain("server-only",Json.String(await settings.ListProvidersAsync()));
        foreach(var bad in new[]{"https://evil.example/chat/completions","../chat/completions","/chat/completions","chat/completions?key=fake"})Assert.Throws<AppException>(()=>ProviderProxy.Target(p,bad));proxy.End(run);await Assert.ThrowsAsync<AppException>(()=>proxy.SendAsync(run,suffix,Encoding.UTF8.GetBytes("{}"),default));
    }
    [Fact]public async Task ImageSwitchesAndConfigurationSnapshotsAreIndependent()
    {
        var requests=0;await using var upstream=await Server(async c=>{requests++;c.Response.ContentType="text/event-stream";await c.Response.WriteAsync("data: [DONE]\n\n");});await using var storage=new StorageService(TempDb());await storage.InitializeAsync();var settings=new SettingsService(storage);using var proxy=new ProviderProxy(settings);
        foreach(var allow in new[]{false,true})foreach(var vision in new[]{false,true}){var p=Provider("openai-completions",upstream.Urls.Single(),allow,vision);await settings.SaveProviderAsync(p);var id=p.GetProperty("id").GetString()!;var run=Guid.NewGuid().ToString();await proxy.BeginAsync(id,"fixture",run);await settings.SaveProviderAsync(Provider("openai-completions","https://changed.invalid",!allow,!vision,id));var body=Encoding.UTF8.GetBytes("{\"model\":\"fixture\",\"messages\":[{\"content\":[{\"type\":\"image_url\",\"image_url\":{\"url\":\"data:image/png;base64,AA==\"}}]}]}");if(allow&&vision){using var response=await proxy.SendAsync(run,"chat/completions",body,default);Assert.True(response.IsSuccessStatusCode);}else await Assert.ThrowsAsync<AppException>(()=>proxy.SendAsync(run,"chat/completions",body,default));proxy.End(run);}Assert.Equal(1,requests);
    }
    [Theory][InlineData("openai-completions","chat/completions","Authorization")][InlineData("openai-responses","responses","Authorization")][InlineData("anthropic-messages","messages","x-api-key")][InlineData("google-generative-ai","models/fixture:streamGenerateContent?alt=sse","x-goog-api-key")]
    public async Task EveryProtocolKeepsTheFrozenKeyAndBlocksRedirectsAfterReplacement(string api,string suffix,string header)
    {
        var keys=new List<string>();var redirect=false;
        await using var upstream=await Server(async c=>{keys.Add(c.Request.Headers[header].ToString());if(redirect){c.Response.StatusCode=302;c.Response.Headers.Location="http://127.0.0.1:1/leak";}else{c.Response.ContentType="text/event-stream";await c.Response.WriteAsync("data: [DONE]\n\n");}});
        await using var storage=new StorageService(TempDb());await storage.InitializeAsync();var settings=new SettingsService(storage);var provider=Provider(api,upstream.Urls.Single());using var proxy=new ProviderProxy(settings);var id=provider.GetProperty("id").GetString()!;await settings.SaveProviderAsync(provider,"old-private-key");var oldRun=Guid.NewGuid().ToString();await proxy.BeginAsync(id,"fixture",oldRun);await settings.SaveProviderAsync(provider,"new-private-key");var newRun=Guid.NewGuid().ToString();await proxy.BeginAsync(id,"fixture",newRun);
        var body=Encoding.UTF8.GetBytes("{\"model\":\"fixture\"}");using(var response=await proxy.SendAsync(oldRun,suffix,body,default))Assert.True(response.IsSuccessStatusCode);using(var response=await proxy.SendAsync(newRun,suffix,body,default))Assert.True(response.IsSuccessStatusCode);Assert.EndsWith("old-private-key",keys[0]);Assert.EndsWith("new-private-key",keys[1]);redirect=true;Assert.Equal("UPSTREAM_REDIRECT_BLOCKED",(await Assert.ThrowsAsync<AppException>(()=>proxy.SendAsync(newRun,suffix,body,default))).Code);Assert.Equal(3,keys.Count);
        await storage.BackupAsync();foreach(var file in Directory.GetFiles(Path.GetDirectoryName(storage.DatabasePath)!)){using var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete);using var bytes=new MemoryStream();await stream.CopyToAsync(bytes);var data=Encoding.UTF8.GetString(bytes.ToArray());Assert.DoesNotContain("old-private-key",data);Assert.DoesNotContain("new-private-key",data);}
    }
    [Theory][InlineData(401,"AUTH_FAILED")][InlineData(429,"RATE_LIMITED")][InlineData(302,"UPSTREAM_REDIRECT_BLOCKED")]
    public async Task ErrorsAndRedirectsAreDistinguishable(int status,string code)
    {
        var count=0;await using var upstream=await Server(c=>{count++;c.Response.StatusCode=status;c.Response.Headers.Location="http://127.0.0.1:1/leak";return Task.CompletedTask;});await using var storage=new StorageService(TempDb());await storage.InitializeAsync();var settings=new SettingsService(storage);using var proxy=new ProviderProxy(settings);var p=Provider("anthropic-messages",upstream.Urls.Single());await settings.SaveProviderAsync(p,"not-a-real-key");var run=Guid.NewGuid().ToString();await proxy.BeginAsync(p.GetProperty("id").GetString()!,"fixture",run);Assert.Equal(code,(await Assert.ThrowsAsync<AppException>(()=>proxy.SendAsync(run,"messages",Encoding.UTF8.GetBytes("{\"model\":\"fixture\"}"),default))).Code);Assert.Equal(1,count);
    }
    [Fact]public async Task DraftTestDoesNotSaveAndCancelsTheUpstream()
    {
        var began=new TaskCompletionSource();var cancelled=new TaskCompletionSource();string? payload=null;await using var upstream=await Server(async c=>{payload=await new StreamReader(c.Request.Body).ReadToEndAsync();began.TrySetResult();try{await Task.Delay(30000,c.RequestAborted);}catch(OperationCanceledException){cancelled.TrySetResult();}});await using var storage=new StorageService(TempDb());await storage.InitializeAsync();var settings=new SettingsService(storage);using var proxy=new ProviderProxy(settings);using var cancel=new CancellationTokenSource();var test=proxy.TestDraftAsync(Provider("openai-completions",upstream.Urls.Single()),"fake-key",cancel.Token);await began.Task;var watch=System.Diagnostics.Stopwatch.StartNew();cancel.Cancel();await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>test);await cancelled.Task.WaitAsync(TimeSpan.FromSeconds(1));Assert.True(watch.ElapsedMilliseconds<1000);Assert.Empty(await settings.ListProvidersAsync());Assert.Contains("Reply OK",payload);Assert.DoesNotContain("document",payload);
    }
    [Fact]public async Task ProviderAndKeyRollbackAtomicallyAndDeletionPreservesHistory()
    {
        await using var storage=new StorageService(TempDb());await storage.InitializeAsync();var settings=new SettingsService(storage);var p=Provider("openai-completions","https://example.invalid/v1");storage.FaultInjection=step=>{if(step=="provider")throw new IOException("disk full");};await Assert.ThrowsAsync<AppException>(()=>settings.SaveProviderAsync(p,"fake-key"));storage.FaultInjection=null;Assert.Empty(await settings.ListProvidersAsync());Assert.False(await settings.HasSecretAsync(p.GetProperty("id").GetString()!));await settings.SaveProviderAsync(p,"fake-key");await settings.DeleteProviderAsync(p.GetProperty("id").GetString()!);Assert.Empty(await settings.ListProvidersAsync());Assert.False(await settings.HasSecretAsync(p.GetProperty("id").GetString()!));
    }
    [Fact]public async Task ProviderSmokeUsesSavedConfigurationWithoutRecordingSecretsOrContent()
    {
        const string secret="smoke-private-sentinel";string? body=null;
        await using var upstream=await Server(async c=>{Assert.Equal("Bearer "+secret,c.Request.Headers.Authorization);body=await new StreamReader(c.Request.Body).ReadToEndAsync();c.Response.ContentType="text/event-stream";await c.Response.WriteAsync("data: private-response\n\n");});
        await using var storage=new StorageService(TempDb());await storage.InitializeAsync();var output=storage.DatabasePath+".smoke.json";
        await Verification.ProviderSmoke.RunAsync(storage.DatabasePath,output);Assert.Contains("blocked",await File.ReadAllTextAsync(output));
        await new SettingsService(storage).SaveProviderAsync(Provider("openai-completions",upstream.Urls.Single()),secret);await Verification.ProviderSmoke.RunAsync(storage.DatabasePath,output);
        var report=await File.ReadAllTextAsync(output);Assert.Contains("passed",report);Assert.DoesNotContain(secret,report);Assert.DoesNotContain("private-response",report);Assert.DoesNotContain("Reply OK",report);Assert.Contains("Reply OK",body);Assert.DoesNotContain("document",body);
    }
    [Fact]public async Task MessagePagesAreBoundedAndConversationDeletionRetainsAnnotations()
    {
        await using var w=new Workspace();await w.Initialize();var conversation=Guid.NewGuid().ToString();var mutations=new List<object>{new{type="conversation.put",value=new{id=conversation,title="history",modelRef="deleted-provider/fixture",createdAt="2026-11-26"}}};string? parent=null;
        for(var i=0;i<121;i++){var id=Guid.NewGuid().ToString();mutations.Add(new{type="message.put",value=new{id,conversationId=conversation,parentId=parent,branchId=conversation,role="user",createdAt="2026-11-26",state="completed",sequence=i,content=new[]{new{type="text",text="message "+i}}}});parent=id;}
        var annotation=Guid.NewGuid().ToString();mutations.Add(new{type="annotation.put",value=new{id=annotation,docHash=w.Handle.DocHash,page=1,type="note",rect=new[]{1,1,20,20},anchor=new[]{1,1},color="#3355FF",opacity=1,author="AI",createdAt="2026-11-26",modifiedAt="2026-11-26",revision=1,migrationState="none",llmRef=new{conversationId=conversation,messageId=parent}}});await w.Storage.CommitAsync(w.Payload(Json.Element(new{type="batch",mutations})),w.Documents);
        Assert.Equal(50,(await w.Storage.ReadDocumentAsync(w.Handle.DocHash,50)).Messages.Length);var page=await w.Storage.ReadMessagesPageAsync(w.Handle.DocHash,conversation,100);Assert.Equal(50,page.Length);Assert.Equal(50,page[0].GetProperty("sequence").GetInt32());Assert.Equal(99,page[^1].GetProperty("sequence").GetInt32());
        await w.Storage.CommitAsync(w.Payload(Json.Element(new{type="batch",mutations=new[]{new{type="conversation.remove",id=conversation}}}),1),w.Documents);var saved=await w.Storage.ReadDocumentAsync(w.Handle.DocHash);Assert.Empty(saved.Messages);Assert.Single(saved.Annotations);
    }
}
