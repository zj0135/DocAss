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
        if (args[0] == "tool-transaction")
        {
            var conversation = Guid.NewGuid().ToString(); var annotation = Guid.NewGuid().ToString(); var run = Guid.NewGuid().ToString(); var call = Guid.NewGuid().ToString();
            var command = Json.Element(new { type = "batch", mutations = new object[] { new { type = "conversation.put", value = new { id = conversation, title = "tool crash", modelRef = "fixture", createdAt = "2026-11-26" } }, new { type = "annotation.put", value = new { id = annotation, docHash = hash, page = 1, type = "note", rect = new[] { 1, 1, 20, 20 }, anchor = new[] { 1, 1 }, color = "#3355FF", opacity = 1, author = "AI", createdAt = "2026-11-26", modifiedAt = "2026-11-26", revision = 1, migrationState = "none", llmRef = new { conversationId = conversation, messageId = Guid.NewGuid().ToString(), runId = run } } }, new { type = "effect.put", value = new { conversationId = conversation, runId = run, toolCallId = call, annotationIds = new[] { annotation }, result = "created" } } } });
            var mutations = 0; storage.FaultInjection = step => { if (step == "mutation" && ++mutations == 2) { File.WriteAllText(report, "annotation written before effect and commit"); Thread.Sleep(Timeout.Infinite); } };
            await storage.CommitAsync(Json.Element(new { schemaVersion = 1, operationId = Guid.NewGuid().ToString(), docId = doc.DocId, expectedRevision = await storage.ReadRevisionAsync(hash), payloadHash = Json.PayloadHash(hash, command), command }), registry); return;
        }
        if (args[0] == "message")
        {
            var conversation = Guid.NewGuid().ToString(); var message = Guid.NewGuid().ToString(); var command = Json.Element(new { type = "batch", mutations = new object[] { new { type = "conversation.put", value = new { id = conversation, title = "interrupted checkpoint", modelRef = "fixture", createdAt = "2026-11-26", headId = message } }, new { type = "message.put", value = new { id = message, conversationId = conversation, parentId = (string?)null, branchId = conversation, role = "assistant", state = "running", createdAt = "2026-11-26", sequence = 0, runId = Guid.NewGuid().ToString(), content = new[] { new { type = "text", text = "acknowledged checkpoint" } } } } } });
            var result = await storage.CommitAsync(Json.Element(new { schemaVersion = 1, operationId = Guid.NewGuid().ToString(), docId = doc.DocId, expectedRevision = await storage.ReadRevisionAsync(hash), payloadHash = Json.PayloadHash(hash, command), command }), registry); await File.WriteAllTextAsync(report, Json.String(result)); await Task.Delay(Timeout.Infinite); return;
        }
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
