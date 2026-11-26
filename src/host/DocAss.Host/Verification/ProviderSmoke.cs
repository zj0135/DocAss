using System.Diagnostics;
using DocAss.Host.Contracts;
using DocAss.Host.Http;
using DocAss.Host.Settings;
using DocAss.Host.Storage;

namespace DocAss.Host.Verification;

public static class ProviderSmoke
{
    // Only reads the existing workspace. Secrets stay inside the host proxy and
    // neither request/response bodies nor exception messages enter the report.
    public static async Task RunAsync(string database, string output, string? providerId = null)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(output)!);
        async Task Write(object report) => await File.WriteAllTextAsync(output, Json.String(report));
        if (!File.Exists(database)) { await Write(new { status = "blocked", reason = "workspace missing" }); return; }
        await using var storage = new StorageService(database); var settings = new SettingsService(storage);
        var providers = await settings.ListProvidersAsync(); var candidates = providers.Where(p => p.GetProperty("models").GetArrayLength() > 0 && (providerId == null || p.GetProperty("id").GetString() == providerId)).OrderByDescending(p => p.GetProperty("isDefault").GetBoolean()).ToArray();
        if (candidates.Length == 0) { await Write(new { status = "blocked", reason = "no configured provider with a model", configuredProviders = providers.Length }); return; }
        var provider = candidates[0]; using var proxy = new ProviderProxy(settings); var watch = Stopwatch.StartNew(); var status = "passed"; string? code = null;
        try { await proxy.TestDraftAsync(provider, null, CancellationToken.None); }
        catch (AppException error) { status = "failed"; code = error.Code; }
        catch { status = "failed"; code = "SMOKE_FAILED"; }
        await Write(new { status, code, providerId = provider.GetProperty("id").GetString(), api = provider.GetProperty("api").GetString(), elapsedMs = watch.Elapsed.TotalMilliseconds, documentIncluded = false, requestOrResponseRecorded = false });
    }
}
