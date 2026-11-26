using System.Text.Json;

namespace DocAss.Host.Http;

/// <summary>
/// Abstraction for proxying LLM requests upstream with protected API credentials.
/// </summary>
public interface IProviderProxy : IDisposable
{
    Task<JsonElement> BeginAsync(string providerId, string modelId, string runId);

    void End(string runId);

    Task<HttpResponseMessage> SendAsync(string runId, string suffix, byte[] body, CancellationToken token);

    Task<object> TestDraftAsync(JsonElement provider, string? replacementKey, CancellationToken token);
}
