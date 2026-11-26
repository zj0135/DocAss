using System.Text.Json;

namespace DocAss.Host.Settings;

/// <summary>
/// Abstraction for application settings, model providers, and credential management.
/// </summary>
public interface ISettingsService
{
    Task<JsonElement> GetAsync();

    Task<JsonElement> UpdateAsync(JsonElement value);

    Task<JsonElement[]> ListProvidersAsync();

    Task SaveProviderAsync(JsonElement provider, string? replacementKey = null, bool deleteKey = false);

    Task DeleteProviderAsync(string id);

    Task<bool> HasSecretAsync(string id);
}
