using System.Text.Json;
using System.Security.Cryptography;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using DocAss.Host.Storage;
using Xunit;
namespace DocAss.Host.Tests;
public sealed class AnnotationVersionTests
{
    private static object Note(string hash,int page=1,string state="none")=>new{id=Guid.NewGuid().ToString(),docHash=hash,page,type="note",rect=new[]{10,20,30,40},anchor=new[]{10,40},color="#3355FF",opacity=1,author="author",createdAt="2026-11-26",modifiedAt="2026-11-26",revision=1,contents="version annotation",migrationState=state};
    private static JsonElement Payload(DocHandle handle,object[] mutations,long revision=0,string? id=null){var command=Json.Element(new{type="batch",mutations});return Json.Element(new{schemaVersion=1,operationId=id??Guid.NewGuid().ToString(),docId=handle.DocId,expectedRevision=revision,payloadHash=Json.PayloadHash(handle.DocHash,command),command});}
    [Fact] public async Task VersionMigrationIsAtomicAndOldSnapshotNeverChanges()
    {
        await using var w=new Workspace();await w.Initialize();using var files=new DocumentService(w.Directory,w.Documents,w.Storage);
        var source=Path.Combine(w.Directory,"changing.pdf");File.Copy(ReadingTests.Fixture("navigation.pdf"),source);var old=await files.OpenAsync(source);var oldHandle=old.Handle!;
        await w.Storage.CommitAsync(Payload(oldHandle,[new{type="annotation.put",value=Note(oldHandle.DocHash,3)}]),w.Documents);
        var original=await File.ReadAllBytesAsync(source);Assert.False(Json.Element(await files.CheckSourceAsync(oldHandle.DocId,default)).GetProperty("changed").GetBoolean());
        File.Copy(ReadingTests.Fixture("mixed.pdf"),source,true);Assert.True(Json.Element(await files.CheckSourceAsync(oldHandle.DocId,default)).GetProperty("changed").GetBoolean());
        var newer=await files.OpenVersionAsync(oldHandle.DocId,default);Assert.Equal(oldHandle.DocHash,newer.PreviousHash);Assert.NotEqual(oldHandle.DocHash,newer.Handle!.DocHash);
        var body=await files.ReadAsync(oldHandle.DocId,false,null,default);using(var stream=body.BodyStream!)Assert.Equal(oldHandle.DocHash,Convert.ToHexStringLower(await SHA256.HashDataAsync(stream)));
        var info=Json.Element(await files.MigrationInfoAsync(newer.Handle.DocId,oldHandle.DocHash,default));Assert.Single(info.GetProperty("annotations").EnumerateArray());Assert.Equal(3,info.GetProperty("pages")[0].GetProperty("page").GetInt32());
        var value=Note(newer.Handle.DocHash,3,"needsReview");var payload=Payload(newer.Handle,[new{type="annotation.put",value},new{type="migration.decision",value=new{oldHash=oldHandle.DocHash,decision="accepted"}}]);
        var steps=0;w.Storage.FaultInjection=step=>{if(step=="mutation"&&++steps==2)throw new IOException("disk full");};await Assert.ThrowsAsync<AppException>(()=>w.Storage.CommitAsync(payload,w.Documents));
        Assert.Empty(await w.Storage.ReadEntitiesAsync(newer.Handle.DocHash,"annotations"));using(var c=w.Storage.OpenRead())Assert.Equal(0L,StorageService.Scalar(c,"SELECT count(*) FROM migration_decisions"));
        w.Storage.FaultInjection=null;await w.Storage.CommitAsync(payload,w.Documents);Assert.Single(await w.Storage.ReadEntitiesAsync(newer.Handle.DocHash,"annotations"));Assert.Single(await w.Storage.ReadEntitiesAsync(oldHandle.DocHash,"annotations"));
        Assert.Equal("accepted",Json.Element(await files.MigrationInfoAsync(newer.Handle.DocId,oldHandle.DocHash,default)).GetProperty("decision").GetString());
        files.Close(newer.Handle.DocId);Assert.Null((await files.OpenAsync(source)).PreviousHash);Assert.Equal(oldHandle.DocHash,Convert.ToHexStringLower(SHA256.HashData(original)));
    }
    [Fact] public async Task DeclinedPairPersistsAndCannotAuthorizeUnrelatedVersions()
    {
        await using var w=new Workspace();await w.Initialize();using var files=new DocumentService(w.Directory,w.Documents,w.Storage);var source=Path.Combine(w.Directory,"decline.pdf");File.Copy(ReadingTests.Fixture("navigation.pdf"),source);var a=(await files.OpenAsync(source)).Handle!;await w.Storage.CommitAsync(Payload(a,[new{type="annotation.put",value=Note(a.DocHash)}]),w.Documents);
        File.Copy(ReadingTests.Fixture("mixed.pdf"),source,true);var b=(await files.OpenAsync(source)).Handle!;await w.Storage.CommitAsync(Payload(b,[new{type="migration.decision",value=new{oldHash=a.DocHash,decision="declined"}}]),w.Documents);files.Close(b.DocId);Assert.Null((await files.OpenAsync(source)).PreviousHash);
        var other=(await files.OpenAsync(ReadingTests.Fixture("blank.pdf"))).Handle!;await Assert.ThrowsAsync<AppException>(()=>files.MigrationInfoAsync(other.DocId,a.DocHash,default));
    }
    [Fact] public async Task VersionOneSchemaUpgradesWithBackupAndKeepsAnnotations()
    {
        await using var w=new Workspace();await w.Initialize();await w.Storage.CommitAsync(Payload(w.Handle,[new{type="annotation.put",value=Note(w.Handle.DocHash)}]),w.Documents);
        await w.Storage.Enqueue(()=>{using var c=w.Storage.OpenWrite();StorageService.Execute(c,"DROP TABLE migration_decisions; PRAGMA user_version=1");return true;});await w.Storage.DisposeAsync();
        await using var next=new StorageService(w.Storage.DatabasePath);await next.InitializeAsync();Assert.Single(await next.ReadEntitiesAsync(w.Handle.DocHash,"annotations"));Assert.True(File.Exists(next.BackupPath));using var connection=next.OpenRead();Assert.Equal(2L,StorageService.Scalar(connection,"PRAGMA user_version"));Assert.Equal(0L,StorageService.Scalar(connection,"SELECT count(*) FROM migration_decisions"));
    }
}
