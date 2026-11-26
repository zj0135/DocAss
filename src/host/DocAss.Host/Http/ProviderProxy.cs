using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using DocAss.Host.Contracts;
using DocAss.Host.Settings;

namespace DocAss.Host.Http;

// Credentials and immutable run configurations never cross the bridge.
public sealed class ProviderProxy(SettingsService settings) : IDisposable
{
    private sealed record Snapshot(JsonElement Provider, JsonElement Model, byte[] Key);
    private readonly ConcurrentDictionary<string, Snapshot> runs = new();
    private readonly HttpClient client = UpstreamHttp.Create();
    private readonly object gate = new();
    public async Task<JsonElement> BeginAsync(string providerId, string modelId, string runId)
    {
        Contract.Check("Id", Json.Element(runId)); Contract.Check("Id", Json.Element(providerId));
        var provider = (await settings.ListProvidersAsync()).SingleOrDefault(p => p.GetProperty("id").GetString() == providerId);
        if (provider.ValueKind == JsonValueKind.Undefined) throw new AppException("UNCONFIGURED", "提供方已删除或未配置");
        var model = provider.GetProperty("models").EnumerateArray().SingleOrDefault(m => m.GetProperty("modelId").GetString() == modelId);
        if (model.ValueKind == JsonValueKind.Undefined) throw new AppException("UNCONFIGURED", "请选择已配置的模型");
        var key = await KeyAsync(provider, null);
        // Queued runs reserve immutable configuration; LoopbackServer limits active HTTP requests to two.
        lock(gate)if (runs.Count >= 16 || !runs.TryAdd(runId, new(provider, model, key))) { CryptographicOperations.ZeroMemory(key); throw new AppException("BUSY", "生成及排队任务已满", true); }
        return provider;
    }
    private async Task<byte[]> KeyAsync(JsonElement provider, string? replacement)
    {
        if (replacement != null) { Contract.Require(replacement.Length is > 0 and <= 8192 && !replacement.Any(char.IsControl)); return Encoding.UTF8.GetBytes(replacement); }
        if (await settings.HasSecretAsync(provider.GetProperty("id").GetString()!)) return await settings.DecryptForUpstreamAsync(provider.GetProperty("id").GetString()!);
        if (new Uri(provider.GetProperty("baseUrl").GetString()!).IsLoopback) return [];
        throw new AppException("UNCONFIGURED", "请先设置 API Key");
    }
    public void End(string runId) { if (runs.TryRemove(runId, out var value)) CryptographicOperations.ZeroMemory(value.Key); }
    public static Uri Target(JsonElement provider, string suffix)
    {
        Contract.Check("Provider", provider);
        var api = provider.GetProperty("api").GetString();
        if(api=="anthropic-messages"&&suffix.EndsWith("?beta=true",StringComparison.Ordinal))suffix=suffix[..^10];
        var valid = api switch {
            "openai-completions" => suffix == "chat/completions",
            "openai-responses" => suffix == "responses",
            "anthropic-messages" => suffix == "v1/messages" || suffix == "messages",
            "google-generative-ai" => Regex.IsMatch(suffix, @"^(v1beta/)?models/[A-Za-z0-9_.-]+:streamGenerateContent\?alt=sse$"),
            _ => false
        };
        if (!valid) throw new AppException("FORBIDDEN", "不允许的模型路由");
        var root = provider.GetProperty("baseUrl").GetString()!.TrimEnd('/');
        if (api == "anthropic-messages") { suffix = "messages"; if (!root.EndsWith("/v1", StringComparison.Ordinal)) root += "/v1"; }
        if (api == "google-generative-ai") { suffix = suffix.Replace("v1beta/", ""); if (!root.EndsWith("/v1beta", StringComparison.Ordinal)) root += "/v1beta"; }
        return new Uri(root + "/" + suffix);
    }
    private static HttpRequestMessage Request(Snapshot run, string suffix, byte[] body)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, Target(run.Provider, suffix));
        request.Content = new ByteArrayContent(body); request.Content.Headers.ContentType = new("application/json");
        request.Headers.Accept.ParseAdd("text/event-stream");
        var key = Encoding.UTF8.GetString(run.Key);
        switch (run.Provider.GetProperty("api").GetString()) {
            case "anthropic-messages": request.Headers.TryAddWithoutValidation("x-api-key", key); request.Headers.Add("anthropic-version", "2023-06-01"); break;
            case "google-generative-ai": request.Headers.TryAddWithoutValidation("x-goog-api-key", key); break;
            default: if (key.Length > 0) request.Headers.Authorization = new("Bearer", key); break;
        }
        return request;
    }
    public async Task<HttpResponseMessage> SendAsync(string runId, string suffix, byte[] body, CancellationToken token)
    {
        if (!runs.TryGetValue(runId, out var run)) throw new AppException("UNCONFIGURED", "生成任务不存在或已结束");
        using var json = JsonDocument.Parse(body); var root = json.RootElement;
        var modelId = run.Model.GetProperty("modelId").GetString()!;
        if (run.Provider.GetProperty("api").GetString() == "google-generative-ai") Contract.Require(suffix == $"v1beta/models/{modelId}:streamGenerateContent?alt=sse" || suffix == $"models/{modelId}:streamGenerateContent?alt=sse", "模型不匹配");
        else Contract.Require(root.GetProperty("model").GetString() == modelId, "模型不匹配");
        if (!run.Provider.GetProperty("imageAllowed").GetBoolean() || !run.Model.GetProperty("input").EnumerateArray().Any(v => v.GetString() == "image"))
            Contract.Require(!ContainsImage(root), "当前模型不允许图像输入");
        using var request = Request(run, suffix, body);
        return await SendCheckedAsync(request, token);
    }
    private static bool ContainsImage(JsonElement v) => v.ValueKind switch {
        JsonValueKind.Object => v.EnumerateObject().Any(p => p.Name is "image_url" or "inlineData" or "inline_data" || p.Name == "type" && p.Value.ValueKind == JsonValueKind.String && p.Value.GetString() is "image" or "input_image" || ContainsImage(p.Value)),
        JsonValueKind.Array => v.EnumerateArray().Any(ContainsImage), _ => false
    };
    private async Task<HttpResponseMessage> SendCheckedAsync(HttpRequestMessage request, CancellationToken token)
    {
        HttpResponseMessage response;
        try { response = await UpstreamHttp.SendAsync(client, request, token); }
        catch (HttpRequestException) { throw new AppException("NETWORK", "无法连接模型服务", true); }
        if (response.IsSuccessStatusCode) return response;
        var status = response.StatusCode; response.Dispose();
        throw new AppException(status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden ? "AUTH_FAILED" : (int)status == 429 ? "RATE_LIMITED" : "PROTOCOL", status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden ? "API 凭据无效或无权限" : (int)status == 429 ? "模型额度或请求频率受限" : $"模型服务返回 HTTP {(int)status}", true);
    }
    public async Task<object> TestDraftAsync(JsonElement provider, string? replacementKey, CancellationToken token)
    {
        Contract.Check("Provider", provider); var model = provider.GetProperty("models").EnumerateArray().FirstOrDefault();
        Contract.Require(model.ValueKind != JsonValueKind.Undefined, "请先添加模型");
        var key = await KeyAsync(provider, replacementKey);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(token); cancel.CancelAfter(TimeSpan.FromSeconds(15));
        var id = model.GetProperty("modelId").GetString()!; var api = provider.GetProperty("api").GetString();
        var suffix = api switch { "openai-completions" => "chat/completions", "openai-responses" => "responses", "anthropic-messages" => "messages", _ => $"models/{id}:streamGenerateContent?alt=sse" };
        object body = api switch {
            "openai-completions" => new { model = id, messages = new[] { new { role = "user", content = "Reply OK" } }, max_tokens = 8, stream = true },
            "openai-responses" => new { model = id, input = "Reply OK", max_output_tokens = 16, stream = true },
            "anthropic-messages" => new { model = id, messages = new[] { new { role = "user", content = "Reply OK" } }, max_tokens = 8, stream = true },
            _ => new { contents = new[] { new { role = "user", parts = new[] { new { text = "Reply OK" } } } }, generationConfig = new { maxOutputTokens = 8 } }
        };
        try {
            using var request = Request(new(provider, model, key), suffix, Encoding.UTF8.GetBytes(Json.String(body)));
            using var response = await SendCheckedAsync(request, cancel.Token);
            var bytes = await BoundedRead.ReadAsync(await response.Content.ReadAsStreamAsync(cancel.Token), 256 * 1024, cancel.Token);
            Contract.Require(bytes.Length > 0, "模型服务返回空响应");
            return new { ok = true, message = "连接成功（最小无文档请求）", maxOutputTokens = api == "openai-responses" ? 16 : 8 };
        } catch (OperationCanceledException) when (!token.IsCancellationRequested) { throw new AppException("TIMEOUT", "连接测试超过 15 秒", true); }
        finally { CryptographicOperations.ZeroMemory(key); }
    }
    public void Dispose() { foreach (var id in runs.Keys) End(id); client.Dispose(); }
}
