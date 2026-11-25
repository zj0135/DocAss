using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Storage;

namespace DocAss.Host.Settings;

public sealed class SettingsService(StorageService storage)
{
    public static JsonElement Defaults => Json.Element(new { revision = 0, author = Environment.UserName, chatWidth = 440, sidePanel = "none", tool = "select", color = "#3B82F6", strokeWidth = 2, opacity = 0.5, window = new { left = 80, top = 80, width = 1280, height = 800, maximized = false } });
    public Task<JsonElement> GetAsync() => storage.Enqueue(() => { using var c = storage.OpenRead(); return Read(c); });
    private static JsonElement Read(Microsoft.Data.Sqlite.SqliteConnection c)
    { var text = StorageService.Scalar(c, "SELECT payload FROM settings WHERE id=1") as string; return text == null ? Defaults : JsonDocument.Parse(text).RootElement.Clone(); }
    public Task<JsonElement> UpdateAsync(JsonElement value) => storage.Enqueue(() =>
    {
        Contract.Check("Settings", value); using var c = storage.OpenWrite(); using var tx = c.BeginTransaction();
        var old = Convert.ToInt64(StorageService.Scalar(c, "SELECT revision FROM settings WHERE id=1", tx) ?? 0);
        if (value.GetProperty("revision").GetInt64() != old) throw new AppException("REVISION_CONFLICT", "设置已变更，请重新载入", true);
        var fields = value.EnumerateObject().ToDictionary(p => p.Name, p => p.Value);
        fields["revision"] = Json.Element(old + 1); var next = Json.Element(fields);
        StorageService.Execute(c, "INSERT INTO settings(id,revision,payload) VALUES(1,$r,$j) ON CONFLICT(id) DO UPDATE SET revision=$r,payload=$j", tx, ("$r", old + 1), ("$j", next.GetRawText()));
        storage.FaultInjection?.Invoke("settings"); tx.Commit(); storage.MarkDirty(); return next;
    });
    public Task<JsonElement[]> ListProvidersAsync() => storage.Enqueue(() =>
    {
        using var c = storage.OpenRead(); using var cmd = StorageService.Command(c, "SELECT p.payload,EXISTS(SELECT 1 FROM secrets s WHERE s.providerId=p.providerId) FROM providers p"); using var reader = cmd.ExecuteReader();
        var result = new List<JsonElement>();
        while (reader.Read())
        {
            var fields = JsonDocument.Parse(reader.GetString(0)).RootElement.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
            fields["hasKey"] = Json.Element(reader.GetBoolean(1)); result.Add(Json.Element(fields));
        }
        return result.ToArray();
    });
    public Task SaveProviderAsync(JsonElement provider, string? replacementKey = null, bool deleteKey = false) => storage.Enqueue(() =>
    {
        Contract.Check("Provider", provider); Contract.Require(replacementKey == null || (replacementKey.Length is > 0 and <= 8192 && !replacementKey.Any(char.IsControl)), "凭据为空或格式错误");
        Contract.Require(!deleteKey || replacementKey == null);
        byte[]? cipher = null;
        if (replacementKey != null)
        {
            var bytes = Encoding.UTF8.GetBytes(replacementKey);
            try { cipher = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser); }
            finally { CryptographicOperations.ZeroMemory(bytes); }
        }
        using var c = storage.OpenWrite(); using var tx = c.BeginTransaction(); var id = provider.GetProperty("id").GetString();
        if (provider.GetProperty("isDefault").GetBoolean()) StorageService.Execute(c, "UPDATE providers SET payload=json_set(payload,'$.isDefault',json('false'))", tx);
        StorageService.Execute(c, "INSERT INTO providers(providerId,payload) VALUES($i,$j) ON CONFLICT(providerId) DO UPDATE SET payload=$j", tx, ("$i", id), ("$j", provider.GetRawText()));
        if (cipher != null) StorageService.Execute(c, "INSERT INTO secrets(providerId,cipher) VALUES($i,$c) ON CONFLICT(providerId) DO UPDATE SET cipher=$c", tx, ("$i", id), ("$c", cipher));
        if (deleteKey) StorageService.Execute(c, "DELETE FROM secrets WHERE providerId=$i", tx, ("$i", id));
        storage.FaultInjection?.Invoke("provider"); tx.Commit(); storage.MarkDirty(); return true;
    });
    public Task DeleteProviderAsync(string id) => storage.Enqueue(() =>
    {
        Contract.Check("Id", Json.Element(id)); using var c = storage.OpenWrite();
        StorageService.Execute(c, "DELETE FROM providers WHERE providerId=$i", null, ("$i", id)); storage.MarkDirty(); return true;
    });
    public Task<bool> HasSecretAsync(string id) => storage.Enqueue(() =>
    {
        Contract.Check("Id", Json.Element(id)); using var c = storage.OpenRead();
        return StorageService.Scalar(c, "SELECT 1 FROM secrets WHERE providerId=$i", null, ("$i", id)) != null;
    });
    // Deliberately internal: no bridge method or frontend service can read saved credentials.
    internal Task<byte[]> DecryptForUpstreamAsync(string id) => storage.Enqueue(() =>
    {
        using var c = storage.OpenRead(); var cipher = StorageService.Scalar(c, "SELECT cipher FROM secrets WHERE providerId=$i", null, ("$i", id)) as byte[];
        if (cipher == null) throw new AppException("UNCONFIGURED", "尚未配置凭据");
        return CredentialVault.Decrypt(cipher);
    });
}
