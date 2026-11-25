using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using DocAss.Host.Contracts;

namespace DocAss.Host.Http;

public sealed class LoopbackServer(string trustedOrigin, Func<CancellationToken,IAsyncEnumerable<string>>? upstream = null) : IAsyncDisposable
{
    public static readonly HashSet<string> AllowedHeaders = new(StringComparer.OrdinalIgnoreCase)
    {
        "content-type", "x-docass-session", "x-request-id", "authorization", "accept",
        "anthropic-version", "anthropic-beta", "anthropic-dangerous-direct-browser-access", "x-api-key", "x-goog-api-client", "x-goog-api-key",
        "x-stainless-lang", "x-stainless-package-version", "x-stainless-os", "x-stainless-arch", "x-stainless-runtime", "x-stainless-runtime-version", "x-stainless-retry-count", "x-stainless-timeout", "x-stainless-helper-method", "x-stainless-helper"
    };
    public string SessionToken { get; } = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
    public string Origin { get; private set; } = "";
    private WebApplication? app;
    private readonly ConcurrentDictionary<string, CancellationTokenSource> requests = new();
    private readonly SemaphoreSlim slots = new(2);
    private readonly CancellationTokenSource lifetime = new();
    public int ActiveRequests => requests.Count;
    public int CancelledRequests { get; private set; }
    internal TimeSpan TotalTimeout { get; set; } = TimeSpan.FromSeconds(180);
    internal TimeSpan IdleTimeout { get; set; } = TimeSpan.FromSeconds(60);
    public async Task StartAsync()
    {
        var builder = WebApplication.CreateSlimBuilder(); builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(options => { options.Listen(IPAddress.Loopback, 0); options.Limits.MaxRequestBodySize = 32 * 1024 * 1024; });
        app = builder.Build(); app.Run(HandleAsync); await app.StartAsync(); Origin = app.Urls.Single();
    }
    private async Task HandleAsync(HttpContext context)
    {
        var request = context.Request; var response = context.Response;
        if (request.Path != "/fixture/stream") { response.StatusCode = 404; return; }
        if (request.Headers.Origin.ToString() != trustedOrigin) { response.StatusCode = 403; return; }
        if (request.Method == "OPTIONS")
        {
            var headers = request.Headers.AccessControlRequestHeaders.ToString().Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            if (request.Headers.AccessControlRequestMethod != "POST" || headers.Any(h => !AllowedHeaders.Contains(h))) { response.StatusCode = 403; return; }
            Cors(response); response.Headers.AccessControlAllowMethods = "POST"; response.Headers.AccessControlAllowHeaders = string.Join(", ", headers);
            response.StatusCode = 204; return;
        }
        if (request.Method != "POST") { response.StatusCode = 405; return; }
        var token = request.Headers["X-DocAss-Session"].ToString();
        if (token.Length != SessionToken.Length || !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(token), Encoding.ASCII.GetBytes(SessionToken))) { response.StatusCode = 401; return; }
        Cors(response);
        if (!Guid.TryParseExact(request.Headers["X-Request-Id"].ToString(), "D", out _)) { response.StatusCode = 400; return; }
        var id = request.Headers["X-Request-Id"].ToString();
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, lifetime.Token); cancel.CancelAfter(TotalTimeout);
        if (!requests.TryAdd(id, cancel)) { response.StatusCode = 409; return; }
        var entered = false;
        try
        {
            await slots.WaitAsync(cancel.Token); entered = true;
            var body = await BoundedRead.ReadAsync(request.Body, 32 * 1024 * 1024, cancel.Token);
            using var document = JsonDocument.Parse(body); Contract.Fields(document.RootElement);
            response.ContentType = "text/event-stream"; response.Headers.CacheControl = "no-cache";
            using var sourceLifetime=CancellationTokenSource.CreateLinkedTokenSource(cancel.Token);
            await using var source=(upstream??SyntheticUpstream)(sourceLifetime.Token).GetAsyncEnumerator(sourceLifetime.Token);
            while (true)
            {
                sourceLifetime.CancelAfter(IdleTimeout);
                if(!await source.MoveNextAsync())break;
                sourceLifetime.CancelAfter(Timeout.InfiniteTimeSpan);
                var part=source.Current;
                await response.WriteAsync("data: " + Json.String(new { text = part }) + "\n\n", cancel.Token);
                await response.Body.FlushAsync(cancel.Token);
            }
            await response.WriteAsync("data: [DONE]\n\n", cancel.Token); await response.Body.FlushAsync(cancel.Token);
        }
        catch (OperationCanceledException) { Interlocked.Increment(ref cancelled); }
        catch (Exception ex) when (ex is AppException or JsonException or IOException)
        { if (!response.HasStarted) response.StatusCode = 400; else context.Abort(); }
        finally { requests.TryRemove(id, out _); if (entered) slots.Release(); CancelledRequests = cancelled; }
    }
    private static async IAsyncEnumerable<string> SyntheticUpstream([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken token)
    {
        foreach(var part in new[]{"第一段","第二段","第三段","第四段"}){await Task.Delay(250,token);yield return part;}
    }
    private int cancelled;
    private void Cors(HttpResponse response) { response.Headers.AccessControlAllowOrigin = trustedOrigin; response.Headers.Vary = "Origin"; }
    public void Cancel(string id) { if (requests.TryGetValue(id, out var cancel)) try { cancel.Cancel(); } catch (ObjectDisposedException) { } }
    public async ValueTask DisposeAsync()
    {
        lifetime.Cancel(); if (app != null) { await app.StopAsync(); await app.DisposeAsync(); }
        lifetime.Dispose(); slots.Dispose();
    }
}

public static class UpstreamHttp
{
    public static HttpClient Create() => new(new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = Timeout.InfiniteTimeSpan };
    public static async Task<HttpResponseMessage> SendAsync(HttpClient client, HttpRequestMessage request, CancellationToken token)
    {
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
        if ((int)response.StatusCode is >= 300 and < 400) { response.Dispose(); throw new AppException("UPSTREAM_REDIRECT_BLOCKED", "上游重定向已阻止"); }
        return response;
    }
}
