using System.Diagnostics;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using DocAss.Host.Settings;
using DocAss.Host.Storage;
using Microsoft.Data.Sqlite;
using Xunit;

namespace DocAss.Host.Tests;

public sealed class Workspace : IAsyncDisposable
{
    public string Directory { get; } = Path.Combine(Path.GetTempPath(), "DocAss-tests", Guid.NewGuid().ToString("N"));
    public StorageService Storage { get; }
    public DocumentRegistry Documents { get; }
    public DocHandle Handle { get; private set; } = null!;
    public Workspace() { System.IO.Directory.CreateDirectory(Directory); Storage = new(Path.Combine(Directory, "workspace.db")); Documents = new(Directory); }
    public async Task Initialize() { await Storage.InitializeAsync(); Handle = Documents.Register(new string('a', 64), "fixture.pdf", 12); await Storage.EnsureDocumentAsync(Handle, 12); }
    public JsonElement Conversation(string? id = null, string title = "test") => Json.Element(new { type = "batch", mutations = new[] { new { type = "conversation.put", value = new { id = id ?? Guid.NewGuid().ToString(), title, modelRef = "fixture", createdAt = "2026-11-25T00:00:00Z" } } } });
    public JsonElement Payload(JsonElement command, long revision = 0, string? operation = null, string? docId = null, string? hash = null) => Json.Element(new { schemaVersion = 1, operationId = operation ?? Guid.NewGuid().ToString(), docId = docId ?? Handle.DocId, expectedRevision = revision, payloadHash = hash ?? Json.PayloadHash(Handle.DocHash, command), command });
    public async ValueTask DisposeAsync() { Documents.Dispose(); await Storage.DisposeAsync(); }
}
public class StorageTests
{
    [Fact] public async Task UnwritableDatabaseNeverCreatesFallback()
    {
        var directory=Path.Combine(Path.GetTempPath(),"DocAss-tests",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);var databasePath=Path.Combine(directory,"workspace.db");Directory.CreateDirectory(databasePath);
        await using var storage=new StorageService(databasePath);Assert.Equal("STORAGE_FAILED",(await Assert.ThrowsAsync<AppException>(storage.InitializeAsync)).Code);Assert.Empty(Directory.EnumerateFiles(directory));
    }
    [Fact] public async Task InterruptedRestoreRequiresExplicitRecovery()
    {
        await using var w=new Workspace();await w.Initialize();await w.Storage.BackupAsync();await w.Storage.DisposeAsync();
        await File.WriteAllTextAsync(w.Storage.DatabasePath+".restore-pending","interrupted");
        await using(var reopened=new StorageService(w.Storage.DatabasePath))Assert.Equal("DATABASE_CORRUPT",(await Assert.ThrowsAsync<AppException>(reopened.InitializeAsync)).Code);
        RecoveryService.Restore(w.Storage.DatabasePath,true);Assert.False(File.Exists(w.Storage.DatabasePath+".restore-pending"));
        await using var recovered=new StorageService(w.Storage.DatabasePath);await recovered.InitializeAsync();Assert.Equal(0,await recovered.ReadRevisionAsync(w.Handle.DocHash));
    }
    [Fact] public async Task CreatesSchemaAndEnforcesForeignKeysWalFull()
    {
        await using var w = new Workspace(); await w.Initialize();
        using var c = w.Storage.OpenRead(); Assert.Equal("wal", StorageService.Scalar(c, "PRAGMA journal_mode")); Assert.Equal(1L, StorageService.Scalar(c, "PRAGMA foreign_keys"));
        await w.Storage.Enqueue(() => { using var write = new SqliteConnection($"Data Source={w.Storage.DatabasePath};Pooling=False"); write.Open(); StorageService.Execute(write, "PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;"); Assert.Equal(2L, StorageService.Scalar(write, "PRAGMA synchronous")); Assert.Throws<SqliteException>(() => StorageService.Execute(write,"INSERT INTO annotations VALUES('missing','id',0,'{}')")); return true; });
        Assert.False(w.Storage.IsReadOnly);
    }
    [Fact] public async Task Retry100TimesReopenAndTamper()
    {
        await using var w = new Workspace(); await w.Initialize(); var command = w.Conversation(); var operation = Guid.NewGuid().ToString(); var p = w.Payload(command, operation: operation);
        var results = await Task.WhenAll(Enumerable.Range(0,100).Select(_ => w.Storage.CommitAsync(p,w.Documents)));
        Assert.All(results,r=>Assert.Equal(1,r.CommittedRevision)); Assert.Single(await w.Storage.ReadEntitiesAsync(w.Handle.DocHash,"conversations"));
        w.Documents.Close(w.Handle.DocId); var reopened = w.Documents.Register(w.Handle.DocHash,"renamed.pdf",12);
        Assert.NotEqual(w.Handle.DocId,reopened.DocId); Assert.Equal(results[0],await w.Storage.CommitAsync(w.Payload(command,operation:operation,docId:reopened.DocId),w.Documents));
        var changed = w.Conversation(title:"changed");
        Assert.Equal("HASH_MISMATCH",(await Assert.ThrowsAsync<AppException>(()=>w.Storage.CommitAsync(w.Payload(changed,operation:operation,docId:reopened.DocId,hash:results[0].PayloadHash),w.Documents))).Code);
        Assert.Equal("OPERATION_CONFLICT",(await Assert.ThrowsAsync<AppException>(()=>w.Storage.CommitAsync(w.Payload(changed,operation:operation,docId:reopened.DocId),w.Documents))).Code);
        Assert.Equal("REVISION_CONFLICT",(await Assert.ThrowsAsync<AppException>(()=>w.Storage.CommitAsync(w.Payload(changed,docId:reopened.DocId),w.Documents))).Code);
    }
    [Theory] [InlineData("revision")] [InlineData("mutation")] [InlineData("operation")]
    public async Task RollbackHasNoPartialRows(string step)
    {
        await using var w = new Workspace(); await w.Initialize(); w.Storage.FaultInjection=s=>{if(s==step)throw new IOException("injected disk failure");};
        await Assert.ThrowsAsync<AppException>(()=>w.Storage.CommitAsync(w.Payload(w.Conversation()),w.Documents));
        Assert.Equal(0,await w.Storage.ReadRevisionAsync(w.Handle.DocHash));Assert.Empty(await w.Storage.ReadEntitiesAsync(w.Handle.DocHash,"conversations"));
    }
    [Fact] public async Task LostAckReturnsOriginalResultAndBackgroundQueue()
    {
        await using var w = new Workspace();await w.Initialize(); var p=w.Payload(w.Conversation());
        w.Storage.FaultInjection=s=>{if(s=="afterCommit")throw new IOException("lost ack");};await Assert.ThrowsAsync<AppException>(()=>w.Storage.CommitAsync(p,w.Documents));w.Storage.FaultInjection=null;
        Assert.Equal(1,(await w.Storage.CommitAsync(p,w.Documents)).CommittedRevision); Assert.NotNull(await w.Storage.GetOperationAsync(w.Handle.DocHash,p.GetProperty("operationId").GetString()!));
        Assert.True(await w.Storage.Enqueue(()=>Thread.CurrentThread.IsThreadPoolThread));
    }
    [Fact] public async Task ConcurrentCommandsCannotOverwriteAndCanRetryCas()
    {
        await using var w=new Workspace();await w.Initialize();var a=w.Payload(w.Conversation(title:"annotation-side"));var b=w.Payload(w.Conversation(title:"checkpoint-side"));
        await w.Storage.CommitAsync(a,w.Documents);await Assert.ThrowsAsync<AppException>(()=>w.Storage.CommitAsync(b,w.Documents));
        await w.Storage.CommitAsync(w.Payload(b.GetProperty("command"),1,b.GetProperty("operationId").GetString()),w.Documents);Assert.Equal(2,(await w.Storage.ReadEntitiesAsync(w.Handle.DocHash,"conversations")).Length);
    }
    [Fact] public async Task BackupDuringWritesAndFailedBackupKeepsPrevious()
    {
        await using var w=new Workspace();await w.Initialize();await w.Storage.CommitAsync(w.Payload(w.Conversation()),w.Documents);await w.Storage.BackupAsync();var previous=File.ReadAllBytes(w.Storage.BackupPath);
        await w.Storage.CommitAsync(w.Payload(w.Conversation(),1),w.Documents);w.Storage.FaultInjection=s=>{if(s=="backup")throw new IOException("disk full");};await Assert.ThrowsAsync<AppException>(w.Storage.BackupAsync);Assert.Equal(previous,File.ReadAllBytes(w.Storage.BackupPath));
        w.Storage.FaultInjection=null;await w.Storage.BackupAsync();Assert.Equal(2,RecoveryService.Inspect(w.Storage.BackupPath).DocumentRevisions[w.Handle.DocHash]);
    }
    [Fact] public async Task FutureSchemaReadOnlyAndCorruptNeverCleared()
    {
        var dir=Path.Combine(Path.GetTempPath(),"DocAss-tests",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(dir);var path=Path.Combine(dir,"future.db");
        using(var c=new SqliteConnection($"Data Source={path};Pooling=False")){c.Open();StorageService.Execute(c,"PRAGMA user_version=999;");}
        await using(var s=new StorageService(path)){await s.InitializeAsync();Assert.True(s.IsReadOnly);await Assert.ThrowsAsync<AppException>(s.BackupAsync);}
        var corrupt=Path.Combine(dir,"corrupt.db");await File.WriteAllTextAsync(corrupt,"intentionally broken");var bytes=File.ReadAllBytes(corrupt);await using(var s=new StorageService(corrupt)){Assert.Equal("DATABASE_CORRUPT",(await Assert.ThrowsAsync<AppException>(s.InitializeAsync)).Code);}Assert.Equal(bytes,File.ReadAllBytes(corrupt));
    }
    [Fact] public async Task MigrationRollbackAndExplicitRestore()
    {
        var dir=Path.Combine(Path.GetTempPath(),"DocAss-tests",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(dir);var path=Path.Combine(dir,"workspace.db");
        using(var c=new SqliteConnection($"Data Source={path};Pooling=False")){c.Open();StorageService.Execute(c,"CREATE TABLE legacy(value TEXT);INSERT INTO legacy VALUES('keep');");}
        await using(var s=new StorageService(path)){s.FaultInjection=step=>{if(step=="migration")throw new IOException("failure");};await Assert.ThrowsAsync<AppException>(s.InitializeAsync);}
        using(var c=new SqliteConnection($"Data Source={path};Pooling=False")){c.Open();Assert.Equal(0L,StorageService.Scalar(c,"PRAGMA user_version"));Assert.Equal("keep",StorageService.Scalar(c,"SELECT value FROM legacy"));Assert.Null(StorageService.Scalar(c,"SELECT name FROM sqlite_master WHERE name='documents'"));}
        Assert.Throws<AppException>(()=>RecoveryService.Restore(path,false));RecoveryService.Restore(path,true);Assert.True(Directory.EnumerateFiles(dir,"*.replaced-*").Any());
    }
    [Fact] public async Task SettingsAndDpapiAreAtomicAndNeverPlaintext()
    {
        await using var w=new Workspace();await w.Initialize();var service=new SettingsService(w.Storage);var initial=await service.GetAsync();Assert.Equal(Environment.UserName,initial.GetProperty("author").GetString());await service.UpdateAsync(initial);
        var id=Guid.NewGuid().ToString();var provider=Json.Element(new{id,name="fixture",api="openai-completions",baseUrl="https://example.com/v1",isDefault=true,imageAllowed=false,models=Array.Empty<object>(),hasKey=false});
        const string secret="sentinel-test-secret-for-dpapi";await service.SaveProviderAsync(provider,secret);Assert.True(await service.HasSecretAsync(id));
        var fields=provider.EnumerateObject().ToDictionary(p=>p.Name,p=>p.Value);fields["name"]=Json.Element("new");w.Storage.FaultInjection=s=>{if(s=="provider")throw new IOException("injected");};await Assert.ThrowsAsync<AppException>(()=>service.SaveProviderAsync(Json.Element(fields),"replacement"));w.Storage.FaultInjection=null;
        Assert.Equal("fixture",(await service.ListProvidersAsync())[0].GetProperty("name").GetString());
        using(var c=w.Storage.OpenRead()){var cipher=(byte[])StorageService.Scalar(c,"SELECT cipher FROM secrets WHERE providerId=$i",null,("$i",id))!;Assert.Equal(secret,System.Text.Encoding.UTF8.GetString(System.Security.Cryptography.ProtectedData.Unprotect(cipher,null,System.Security.Cryptography.DataProtectionScope.CurrentUser)));}
        await w.Storage.BackupAsync();Assert.DoesNotContain(secret,System.Text.Encoding.UTF8.GetString(File.ReadAllBytes(w.Storage.BackupPath)));await service.DeleteProviderAsync(id);Assert.False(await service.HasSecretAsync(id));
    }
}
