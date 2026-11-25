using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using DocAss.Host.Bridge;
using DocAss.Host.Contracts;
using DocAss.Host.Http;
using DocAss.Host.Windowing;
using Xunit;

namespace DocAss.Host.Tests;
public class TransportTests
{
    [Fact] public async Task BridgeCorrelates100AndRejectsBadOriginsSchemasAndOldSessions()
    {
        using var router=new BridgeRouter(MainWindow.PublishedOrigin);
        router.Register("test.echo",async(p,t)=>{await Task.Delay(100-p.GetProperty("index").GetInt32(),t);return p.GetProperty("index").GetInt32();});
        string Message(int i,int v=1)=>Json.String(new{v,kind="req",id=Guid.NewGuid().ToString(),method="test.echo",@params=new{index=i}});
        var responses=await Task.WhenAll(Enumerable.Range(0,100).Select(i=>router.DispatchAsync(MainWindow.PublishedOrigin+"/",true,Message(i))));
        for(var i=0;i<100;i++)Assert.Equal(i,Json.Element(responses[i]!).GetProperty("result").GetInt32());Assert.Equal(0,router.PendingCount);
        foreach(var (origin,main) in new[]{("https://evil.example/",true),(MainWindow.PublishedOrigin+"/",false),(MainWindow.PublishedOrigin+"/other.html",true)}) Assert.Equal("FORBIDDEN",Json.Element((await router.DispatchAsync(origin,main,Message(1)))!).GetProperty("error").GetProperty("code").GetString());
        Assert.Equal("UNSUPPORTED_VERSION",Json.Element((await router.DispatchAsync(MainWindow.PublishedOrigin+"/",true,Message(1,2)))!).GetProperty("error").GetProperty("code").GetString());
        var unknown=Json.String(new{v=1,kind="req",id=Guid.NewGuid().ToString(),method="secrets.getKey",@params=new{}});
        Assert.Equal("UNKNOWN_METHOD",Json.Element((await router.DispatchAsync(MainWindow.PublishedOrigin+"/",true,unknown))!).GetProperty("error").GetProperty("code").GetString());
        var old=router.DispatchAsync(MainWindow.PublishedOrigin+"/",true,Message(0));router.Reset();Assert.Null(await old);Assert.Equal(0,router.PendingCount);
    }
    [Fact] public async Task StaticMimeRangesTraversalAndBoundedUploads()
    {
        var dir=Path.Combine(Path.GetTempPath(),"DocAss-resources",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(dir);await File.WriteAllBytesAsync(Path.Combine(dir,"test.wasm"),[0,97,115,109]);var h=new HostResourceHandler(dir,MainWindow.PublishedOrigin);
        foreach(var path in new[]{"/../secret","/%2e%2e/secret","/%252e%252e/secret","/a%5c..%5csecret","/file:stream"})Assert.Equal(403,(await h.HandleAsync(new("GET",MainWindow.PublishedOrigin+path),default)).Status);
        Assert.Equal("application/wasm",(await h.HandleAsync(new("GET",MainWindow.PublishedOrigin+"/test.wasm"),default)).Mime);Assert.Equal("text/javascript; charset=utf-8",HostResourceHandler.Mime("worker.mjs"));
        var bytes=Enumerable.Range(0,100).Select(i=>(byte)i).ToArray();Assert.Equal(new byte[]{0,1,2},HostResourceHandler.Bytes(bytes,"x","bytes=0-2").Body);Assert.Equal(new byte[]{97,98,99},HostResourceHandler.Bytes(bytes,"x","bytes=-3").Body);
        foreach(var range in new[]{"bytes=200-","bytes=5-4","bytes=0-1,3-4","bytes=-0"})Assert.Equal(416,HostResourceHandler.Bytes(bytes,"x",range).Status);
        using var body=new MemoryStream(new byte[16*1024*1024]);Assert.Equal(body.Length,(await BoundedRead.ReadAsync(body,16*1024*1024,default)).Length);body.Position=0;await Assert.ThrowsAsync<AppException>(()=>BoundedRead.ReadAsync(body,100,default));
    }
    [Fact] public async Task LoopbackPreflightTokenOriginCancellationAndPortLifetime()
    {
        var server=new LoopbackServer(MainWindow.PublishedOrigin);await server.StartAsync();Assert.StartsWith("http://127.0.0.1:",server.Origin);var endpoint=server.Origin+"/fixture/stream";
        using var client=new HttpClient();
        HttpRequestMessage Request(string method,string origin=MainWindow.PublishedOrigin,string? token=null) {var r=new HttpRequestMessage(new HttpMethod(method),endpoint);r.Headers.Add("Origin",origin);r.Headers.Add("X-Request-Id",Guid.NewGuid().ToString());if(token!=null)r.Headers.Add("X-DocAss-Session",token);if(method=="POST")r.Content=new StringContent("{}",Encoding.UTF8,"application/json");return r;}
        using(var options=Request("OPTIONS")){options.Headers.Add("Access-Control-Request-Method","POST");options.Headers.Add("Access-Control-Request-Headers",string.Join(',',LoopbackServer.AllowedHeaders));Assert.Equal(HttpStatusCode.NoContent,(await client.SendAsync(options)).StatusCode);}
        using(var bad=Request("OPTIONS")){bad.Headers.Add("Access-Control-Request-Method","POST");bad.Headers.Add("Access-Control-Request-Headers","x-unknown");Assert.Equal(HttpStatusCode.Forbidden,(await client.SendAsync(bad)).StatusCode);}
        foreach(var token in new string?[]{null,"wrong"})Assert.Equal(HttpStatusCode.Unauthorized,(await client.SendAsync(Request("POST",token:token))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,(await client.SendAsync(Request("POST","https://evil.example",server.SessionToken))).StatusCode);Assert.Equal(HttpStatusCode.MethodNotAllowed,(await client.SendAsync(Request("GET",token:server.SessionToken))).StatusCode);
        using(var req=Request("POST",token:server.SessionToken))
        using(var response=await client.SendAsync(req,HttpCompletionOption.ResponseHeadersRead))
        {
            var reader=new StreamReader(await response.Content.ReadAsStreamAsync());Assert.StartsWith("data:",await reader.ReadLineAsync());var started=System.Diagnostics.Stopwatch.StartNew();server.Cancel(req.Headers.GetValues("X-Request-Id").Single());
            for(var i=0;i<100&&server.ActiveRequests>0;i++)await Task.Delay(5);Assert.Equal(0,server.ActiveRequests);Assert.True(started.ElapsedMilliseconds<1000);
        }
        await server.DisposeAsync();await Assert.ThrowsAsync<HttpRequestException>(()=>client.GetAsync(endpoint));
    }
    [Fact] public async Task RedirectNeverForwardsCredentials()
    {
        var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();var address=$"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}";var served=Task.Run(async()=>{using var peer=await listener.AcceptTcpClientAsync();var stream=peer.GetStream();using var reader=new StreamReader(stream,Encoding.ASCII,leaveOpen:true);while(!string.IsNullOrEmpty(await reader.ReadLineAsync())){}await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 302 Found\r\nLocation: {address}/leak\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"));});
        using var client=UpstreamHttp.Create();using var req=new HttpRequestMessage(HttpMethod.Get,address);req.Headers.Add("X-Api-Key","sentinel");Assert.Equal("UPSTREAM_REDIRECT_BLOCKED",(await Assert.ThrowsAsync<AppException>(()=>UpstreamHttp.SendAsync(client,req,default))).Code);await served;Assert.False(listener.Pending());listener.Stop();
    }
    [Fact] public async Task CloseCoordinatorMergesRequestsAndPreservesBlockedState()
    {
        var calls=0;var coordinator=new CloseCoordinator(async()=>{calls++;await Task.Delay(10);throw new IOException();});var a=coordinator.RequestAsync();var b=coordinator.RequestAsync();Assert.Same(a,b);Assert.False(await a);Assert.Equal(1,calls);Assert.Equal("closeBlocked",coordinator.State);coordinator.CancelClose();Assert.Equal("open",coordinator.State);
        Assert.Equal(new Bounds(0,0,683,384),WindowPlacement.Clamp(new(5000,2000,1280,800),new(0,0,683,384)));
    }
}
