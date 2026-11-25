using System.Net;
using System.Net.Sockets;
using System.Runtime.CompilerServices;
using System.Text;
using DocAss.Host.Http;
using Xunit;

namespace DocAss.Host.Tests;
public class StreamingAcceptanceTests
{
    [Fact] public async Task RecordedPinnedSdkHeadersPassRealPreflightWithoutToken()
    {
        using var fixtures=System.Text.Json.JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"sdk-header-fixtures.json")));
        await using var server=new LoopbackServer(MainWindow.PublishedOrigin);await server.StartAsync();using var client=new HttpClient();
        foreach(var sdk in fixtures.RootElement.EnumerateArray())
        {
            using var request=new HttpRequestMessage(HttpMethod.Options,server.Origin+"/fixture/stream");request.Headers.Add("Origin",MainWindow.PublishedOrigin);request.Headers.Add("Access-Control-Request-Method","POST");
            // User-Agent is browser-controlled and never included in Access-Control-Request-Headers.
            var headers=sdk.GetProperty("headers").EnumerateArray().Select(x=>x.GetString()!).Where(x=>x!="user-agent").Concat(["x-docass-session","x-request-id"]);
            request.Headers.Add("Access-Control-Request-Headers",string.Join(',',headers));using var response=await client.SendAsync(request);Assert.Equal(HttpStatusCode.NoContent,response.StatusCode);
        }
    }
    private static HttpRequestMessage Request(LoopbackServer server,string id)
    {
        var request=new HttpRequestMessage(HttpMethod.Post,server.Origin+"/fixture/stream"){Content=new StringContent("{}",Encoding.UTF8,"application/json")};
        request.Headers.Add("Origin",MainWindow.PublishedOrigin);request.Headers.Add("X-DocAss-Session",server.SessionToken);request.Headers.Add("X-Request-Id",id);return request;
    }
    [Fact] public async Task BridgeCancellationDisconnectsRealHttpSyntheticUpstream()
    {
        var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();var uri=new Uri($"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/");
        var disconnected=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var upstream=Task.Run(async()=>
        {
            using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(10));using var peer=await listener.AcceptTcpClientAsync(timeout.Token);var stream=peer.GetStream();using var reader=new StreamReader(stream,Encoding.ASCII,leaveOpen:true);
            while(!string.IsNullOrEmpty(await reader.ReadLineAsync(timeout.Token))){}
            const string body="first\n";await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Type: text/plain\r\n\r\n{body.Length:X}\r\n{body}\r\n"),timeout.Token);
            var buffer=new byte[1];try{while(await stream.ReadAsync(buffer,timeout.Token)>0){}}catch(IOException){}disconnected.TrySetResult();
        });
        async IAsyncEnumerable<string> Source([EnumeratorCancellation] CancellationToken token)
        {
            using var http=UpstreamHttp.Create();using var request=new HttpRequestMessage(HttpMethod.Get,uri);using var response=await UpstreamHttp.SendAsync(http,request,token);using var reader=new StreamReader(await response.Content.ReadAsStreamAsync(token));
            while(await reader.ReadLineAsync(token) is { } line)yield return line;
        }
        await using var server=new LoopbackServer(MainWindow.PublishedOrigin,Source);await server.StartAsync();using var client=new HttpClient();var id=Guid.NewGuid().ToString();using var req=Request(server,id);using var response=await client.SendAsync(req,HttpCompletionOption.ResponseHeadersRead);using var input=new StreamReader(await response.Content.ReadAsStreamAsync());Assert.Contains("first",await input.ReadLineAsync());
        var timer=System.Diagnostics.Stopwatch.StartNew();server.Cancel(id);await disconnected.Task.WaitAsync(TimeSpan.FromSeconds(1));Assert.True(timer.ElapsedMilliseconds<1000);await upstream;listener.Stop();
    }
    [Theory][InlineData(true)][InlineData(false)] public async Task ConcurrencyAndIdleOrTotalDeadlineCancelProducer(bool idle)
    {
        var active=0;var peak=0;var released=0;
        async IAsyncEnumerable<string> Source([EnumeratorCancellation] CancellationToken token)
        {
            var count=Interlocked.Increment(ref active);int seen;do{seen=Volatile.Read(ref peak);}while(count>seen&&Interlocked.CompareExchange(ref peak,count,seen)!=seen);
            try{while(true){await Task.Delay(idle?10000:20,token);yield return "part";}}
            finally{Interlocked.Decrement(ref active);Interlocked.Increment(ref released);}
        }
        await using var server=new LoopbackServer(MainWindow.PublishedOrigin,Source){IdleTimeout=TimeSpan.FromMilliseconds(idle?80:200),TotalTimeout=TimeSpan.FromMilliseconds(250)};
        await server.StartAsync();using var client=new HttpClient();await Task.WhenAll(Enumerable.Range(0,3).Select(async _=>{using var req=Request(server,Guid.NewGuid().ToString());using var response=await client.SendAsync(req);await response.Content.ReadAsByteArrayAsync();}));
        Assert.InRange(peak,1,2);Assert.Equal(0,active);Assert.InRange(released,1,3);Assert.Equal(0,server.ActiveRequests);
    }
    [Fact] public async Task OnlyTwoProducersRunAndQueuedCancellationDoesNotStartThird()
    {
        var bothStarted=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);var active=0;var started=0;
        async IAsyncEnumerable<string> Source([EnumeratorCancellation] CancellationToken token)
        {
            Interlocked.Increment(ref started);if(Interlocked.Increment(ref active)==2)bothStarted.TrySetResult();
            try{await Task.Delay(Timeout.Infinite,token);yield return "unreachable";}finally{Interlocked.Decrement(ref active);}
        }
        await using var server=new LoopbackServer(MainWindow.PublishedOrigin,Source);await server.StartAsync();using var client=new HttpClient();var ids=Enumerable.Range(0,3).Select(_=>Guid.NewGuid().ToString()).ToArray();
        async Task Send(string id){using var req=Request(server,id);using var response=await client.SendAsync(req);}
        var first=Send(ids[0]);var second=Send(ids[1]);await bothStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));var third=Send(ids[2]);
        for(var i=0;i<500&&server.ActiveRequests!=3;i++)await Task.Delay(10);Assert.Equal(3,server.ActiveRequests);Assert.Equal(2,active);Assert.Equal(2,started);
        server.Cancel(ids[2]);await third;Assert.Equal(2,started);server.Cancel(ids[0]);server.Cancel(ids[1]);await Task.WhenAll(first,second);Assert.Equal(0,active);Assert.Equal(0,server.ActiveRequests);
    }
}
