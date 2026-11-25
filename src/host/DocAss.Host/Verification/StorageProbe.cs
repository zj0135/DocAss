using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using DocAss.Host.Storage;

namespace DocAss.Host.Verification;

public static class StorageProbe
{
    public static async Task Run(string[] args)
    {
        var directory = args[1]; var report = args[2]; var hash = args.Length > 3 ? args[3] : new string('a', 64);
        using var registry = new DocumentRegistry(directory); var doc = registry.Register(hash, "fixture.pdf", 1);
        if (args[0] == "lock") { await File.WriteAllTextAsync(report, Json.String(doc)); await Task.Delay(Timeout.Infinite); return; }
        await using var storage = new StorageService(Path.Combine(directory, "workspace.db")); await storage.InitializeAsync(); await storage.EnsureDocumentAsync(doc, 1);
        using var file = new FileStream(report, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
        for (var i = 0; i < 100; i++)
        {
            var revision = await storage.ReadRevisionAsync(hash);
            var command = Json.Element(new { type = "batch", mutations = new[] { new { type = "conversation.put", value = new { id = Guid.NewGuid().ToString(), title = "ack " + i, modelRef = "fixture", createdAt = "2026-11-25T00:00:00Z" } } } });
            var result = await storage.CommitAsync(Json.Element(new { schemaVersion = 1, operationId = Guid.NewGuid().ToString(), docId = doc.DocId, expectedRevision = revision, payloadHash = Json.PayloadHash(hash, command), command }), registry);
            var bytes = System.Text.Encoding.UTF8.GetBytes(Json.String(result) + "\n"); file.Write(bytes); file.Flush(true);
        }
        await Task.Delay(Timeout.Infinite);
    }
}
