using System.Threading.Channels;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;

namespace DocAss.Host.Storage;

public sealed record DocumentSnapshot(long DocumentRevision, JsonElement[] Annotations, JsonElement[] Conversations, JsonElement[] Messages);

public sealed class StorageService : IAsyncDisposable
{
    public const int SchemaVersion = 3;
    public string DatabasePath { get; }
    public string BackupPath => DatabasePath + ".backup";
    public bool IsReadOnly { get; private set; }
    public bool Dirty { get; private set; }
    private readonly Channel<Func<Task>> queue = Channel.CreateUnbounded<Func<Task>>(new() { SingleReader = true });
    private readonly Task worker;
    private readonly CancellationTokenSource lifetime = new();
    private Task? backupTimer;
    private int disposed;
    public Action<string>? FaultInjection { get; set; }
    public event Action<AppException>? BackgroundError;
    public StorageService(string databasePath)
    {
        DatabasePath = Path.GetFullPath(databasePath);
        worker = Task.Run(async () => { await foreach (var work in queue.Reader.ReadAllAsync()) await work(); });
    }
    public async Task InitializeAsync()
    {
        await Enqueue(() =>
        {
            Directory.CreateDirectory(Path.GetDirectoryName(DatabasePath)!);
            if (File.Exists(DatabasePath + ".restore-pending")) throw new AppException("DATABASE_CORRUPT", "上次恢复被中断，原文件已保留，请明确选择再次恢复备份。");
            if (File.Exists(DatabasePath))
            {
                using var existing = OpenRaw(true);
                if (Convert.ToInt32(Scalar(existing,"PRAGMA user_version")) > SchemaVersion) { IsReadOnly=true;return true; }
            }
            using var connection = OpenRaw(false);
            if (Scalar(connection, "PRAGMA integrity_check")?.ToString() != "ok") throw new AppException("DATABASE_CORRUPT", "数据库损坏，未修改原文件。可从最近备份恢复。");
            var version = Convert.ToInt32(Scalar(connection, "PRAGMA user_version"));
            if (version > SchemaVersion) { IsReadOnly = true; return true; }
            Execute(connection, "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000;");
            if (version < SchemaVersion)
            {
                if (File.Exists(DatabasePath) && new FileInfo(DatabasePath).Length > 0) BackupCore(connection);
                using var tx = connection.BeginTransaction();
                Execute(connection, SchemaSql, tx);
                FaultInjection?.Invoke("migration");
                Execute(connection, "PRAGMA user_version=3", tx); tx.Commit();
            }
            return true;
        });
        backupTimer = Task.Run(async () =>
        {
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(60));
            try { while (await timer.WaitForNextTickAsync(lifetime.Token)) if (Dirty && !IsReadOnly) try { await BackupAsync(); } catch (AppException ex) { BackgroundError?.Invoke(ex); } }
            catch (OperationCanceledException) { }
        });
    }
    public Task<T> Enqueue<T>(Func<T> action)
    {
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!queue.Writer.TryWrite(() =>
        {
            try { completion.SetResult(action()); }
            catch (Exception ex) { completion.SetException(MapError(ex)); }
            return Task.CompletedTask;
        })) completion.SetException(new AppException("STORAGE_FAILED", "存储正在关闭"));
        return completion.Task;
    }
    public SqliteConnection OpenRead() => OpenRaw(true);
    internal SqliteConnection OpenWrite()
    {
        if (IsReadOnly) throw new AppException("FUTURE_SCHEMA", "数据库版本较新，禁止写入");
        return OpenRaw(false);
    }
    private SqliteConnection OpenRaw(bool readOnly)
    {
        var c = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = DatabasePath, Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWriteCreate, Pooling = false, DefaultTimeout = 2 }.ToString());
        try { c.Open(); Execute(c, "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000;"); if (!readOnly) Execute(c, "PRAGMA synchronous=FULL;"); return c; }
        catch { c.Dispose(); throw; }
    }
    public Task EnsureDocumentAsync(DocHandle handle, int pageCount) => Enqueue(() =>
    {
        using var c = OpenWrite();
        Execute(c, "INSERT INTO documents(docHash,documentRevision,pageCount,displayName,schemaVersion) VALUES($h,0,$p,$n,1) ON CONFLICT(docHash) DO NOTHING", null, ("$h", handle.DocHash), ("$p", pageCount), ("$n", handle.FileName));
        Dirty = true; return true;
    });
    public Task<DocumentSnapshot> ReadDocumentAsync(string hash, int? messageLimit = null) => Enqueue(() =>
    {
        using var c = OpenRead(); using var tx = c.BeginTransaction(deferred: true);
        var revision = Convert.ToInt64(Scalar(c, "SELECT documentRevision FROM documents WHERE docHash=$h", tx, ("$h", hash)) ?? throw new AppException("DOCUMENT_CLOSED", "文档记录不存在"));
        JsonElement[] Rows(string sql)
        {
            using var command = Command(c, sql, tx, ("$h", hash)); using var reader = command.ExecuteReader(); var values = new List<JsonElement>();
            while (reader.Read()) values.Add(JsonDocument.Parse(reader.GetString(0)).RootElement.Clone()); return values.ToArray();
        }
        var snapshot = new DocumentSnapshot(revision, Rows("SELECT payload FROM annotations WHERE docHash=$h"), Rows("SELECT payload FROM conversations WHERE docHash=$h"), Rows(messageLimit == null ? "SELECT payload FROM messages WHERE docHash=$h ORDER BY sequence" : "SELECT payload FROM (SELECT payload,sequence FROM messages WHERE docHash=$h ORDER BY sequence DESC LIMIT 50) ORDER BY sequence"));
        tx.Commit(); return snapshot;
    });
    public Task<JsonElement[]> ReadMessagesPageAsync(string hash,string conversationId,int before) => Enqueue(() =>
    {
        Contract.Check("Id",Json.Element(conversationId));Contract.Require(before>=0);
        using var c=OpenRead();using var command=Command(c,"SELECT payload FROM messages WHERE docHash=$h AND conversationId=$c AND sequence<$b ORDER BY sequence DESC LIMIT 50",null,("$h",hash),("$c",conversationId),("$b",before));using var reader=command.ExecuteReader();var values=new List<JsonElement>();while(reader.Read())values.Add(JsonDocument.Parse(reader.GetString(0)).RootElement.Clone());values.Reverse();return values.ToArray();
    });
    public Task<long> ReadRevisionAsync(string hash) => Enqueue(() => { using var c = OpenRead(); return Convert.ToInt64(Scalar(c, "SELECT documentRevision FROM documents WHERE docHash=$h", null, ("$h", hash)) ?? throw new AppException("DOCUMENT_CLOSED", "文档记录不存在")); });
    public Task<JsonElement?> GetOperationAsync(string hash, string operationId) => Enqueue(() =>
    {
        Contract.Check("Id", Json.Element(operationId)); using var c = OpenRead();
        var result = Scalar(c, "SELECT result FROM operations WHERE docHash=$h AND operationId=$i", null, ("$h", hash), ("$i", operationId)) as string;
        return result == null ? (JsonElement?)null : JsonDocument.Parse(result).RootElement.Clone();
    });
    public Task<CommitResult> CommitAsync(JsonElement payload, DocumentRegistry registry) => Enqueue(() =>
    {
        Contract.Check("CommitCommand", payload);
        var handle = registry.Resolve(payload.GetProperty("docId").GetString()!, true);
        var command = payload.GetProperty("command");
        var hash = Json.PayloadHash(handle.DocHash, command);
        if (hash != payload.GetProperty("payloadHash").GetString()) throw new AppException("HASH_MISMATCH", "提交内容与摘要不一致");
        var operation = payload.GetProperty("operationId").GetString()!;
        using var c = OpenWrite(); using var tx = c.BeginTransaction();
        using (var query = Command(c, "SELECT payloadHash,result FROM operations WHERE docHash=$h AND operationId=$i", tx, ("$h", handle.DocHash), ("$i", operation)))
        using (var r = query.ExecuteReader())
        {
            if (r.Read())
            {
                if (r.GetString(0) != hash) throw new AppException("OPERATION_CONFLICT", "同一操作编号不能用于不同内容");
                return JsonSerializer.Deserialize<CommitResult>(r.GetString(1), Json.Options)!;
            }
        }
        var expected = payload.GetProperty("expectedRevision").GetInt64();
        if (Execute(c, "UPDATE documents SET documentRevision=documentRevision+1 WHERE docHash=$h AND documentRevision=$r", tx, ("$h", handle.DocHash), ("$r", expected)) != 1) throw new AppException("REVISION_CONFLICT", "文档已更新，请读取最新版本", true);
        FaultInjection?.Invoke("revision");
        foreach (var mutation in command.GetProperty("mutations").EnumerateArray())
        {
            Apply(c, tx, handle.DocHash, registry.PageCount(handle.DocId), mutation, expected + 1);
            FaultInjection?.Invoke("mutation");
        }
        var result = new CommitResult(operation, expected + 1, hash);
        Execute(c, "INSERT INTO operations(docHash,operationId,payloadHash,result,committedRevision) VALUES($h,$i,$p,$j,$r)", tx, ("$h", handle.DocHash), ("$i", operation), ("$p", hash), ("$j", Json.String(result)), ("$r", expected + 1));
        FaultInjection?.Invoke("operation"); tx.Commit(); Dirty = true;
        FaultInjection?.Invoke("afterCommit"); return result;
    });
    private static void Apply(SqliteConnection c, SqliteTransaction tx, string hash, int pageCount, JsonElement m, long revision)
    {
        var type = m.GetProperty("type").GetString();
        if (type!.EndsWith(".remove"))
        {
            var sql = type switch { "annotation.remove" => "DELETE FROM annotations WHERE docHash=$h AND annotationId=$i", "message.remove" => "DELETE FROM messages WHERE docHash=$h AND messageId=$i", "conversation.remove" => "DELETE FROM conversations WHERE docHash=$h AND conversationId=$i", _ => throw new AppException("INVALID_PAYLOAD", "未知命令") };
            Execute(c, sql, tx, ("$h", hash), ("$i", m.GetProperty("id").GetString())); return;
        }
        var v = m.GetProperty("value");
        string S(string key) => v.GetProperty(key).GetString()!;
        var json = v.GetRawText();
        switch (type)
        {
            case "annotation.put":
                Contract.Require(S("docHash") == hash && (v.GetProperty("page").GetInt32() <= pageCount||S("migrationState")=="needsReview"), "标注文档或页码不匹配");
                Execute(c, "INSERT INTO annotations(docHash,annotationId,revision,payload) VALUES($h,$i,$r,$j) ON CONFLICT(docHash,annotationId) DO UPDATE SET revision=$r,payload=$j", tx, ("$h", hash), ("$i", S("id")), ("$r", revision), ("$j", json)); break;
            case "conversation.put":
                Execute(c, "INSERT INTO conversations(docHash,conversationId,payload) VALUES($h,$i,$j) ON CONFLICT(docHash,conversationId) DO UPDATE SET payload=$j", tx, ("$h", hash), ("$i", S("id")), ("$j", json)); break;
            case "migration.decision":
                Contract.Require(S("oldHash")!=hash&&Scalar(c,"SELECT 1 FROM source_paths a JOIN source_paths b ON a.path=b.path WHERE a.docHash=$old AND b.docHash=$new",tx,("$old",S("oldHash")),("$new",hash))!=null,"版本不属于同一源文件");
                Execute(c,"INSERT INTO migration_decisions(oldHash,newHash,decision) VALUES($o,$n,$d) ON CONFLICT(oldHash,newHash) DO UPDATE SET decision=$d",tx,("$o",S("oldHash")),("$n",hash),("$d",S("decision")));break;
            case "message.put":
                Contract.Require(Execute(c, "INSERT INTO messages(docHash,messageId,conversationId,sequence,state,payload) VALUES($h,$i,$c,$s,$t,$j) ON CONFLICT(docHash,messageId) DO UPDATE SET payload=$j,state=$t,sequence=$s WHERE conversationId=$c", tx, ("$h", hash), ("$i", S("id")), ("$c", S("conversationId")), ("$s", v.GetProperty("sequence").GetInt32()), ("$t", S("state")), ("$j", json)) == 1, "消息不能更换所属会话");
                Execute(c, "DELETE FROM attachment_refs WHERE docHash=$h AND messageId=$i", tx, ("$h", hash), ("$i", S("id")));
                foreach (var block in v.GetProperty("content").EnumerateArray().Where(b => b.GetProperty("type").GetString() == "attachment"))
                    Execute(c, "INSERT OR IGNORE INTO attachment_refs(docHash,messageId,attachmentId) VALUES($h,$i,$a)", tx, ("$h", hash), ("$i", S("id")), ("$a", block.GetProperty("attachmentId").GetString()));
                break;
            case "effect.put":
                foreach (var id in v.GetProperty("annotationIds").EnumerateArray()) Contract.Require(Scalar(c, "SELECT 1 FROM annotations WHERE docHash=$h AND annotationId=$i", tx, ("$h", hash), ("$i", id.GetString())) != null, "工具结果引用不存在的标注");
                Execute(c, "INSERT INTO tool_effects(docHash,conversationId,runId,toolCallId,result) VALUES($h,$c,$r,$t,$j)", tx, ("$h", hash), ("$c", S("conversationId")), ("$r", S("runId")), ("$t", S("toolCallId")), ("$j", json)); break;
        }
    }
    public Task<JsonElement[]> ReadEntitiesAsync(string hash, string entity) => Enqueue(() =>
    {
        var sql = entity switch { "annotations" => "SELECT payload FROM annotations WHERE docHash=$h", "conversations" => "SELECT payload FROM conversations WHERE docHash=$h", "messages" => "SELECT payload FROM messages WHERE docHash=$h ORDER BY sequence", _ => throw new AppException("INVALID_PAYLOAD", "不支持的读取类型") };
        using var c = OpenRead(); using var command = Command(c, sql, null, ("$h", hash)); using var reader = command.ExecuteReader();
        var result = new List<JsonElement>(); while (reader.Read()) result.Add(JsonDocument.Parse(reader.GetString(0)).RootElement.Clone()); return result.ToArray();
    });
    public Task BackupAsync() => Enqueue(() => { using var c = OpenWrite(); BackupCore(c); Dirty = false; return true; });
    private void BackupCore(SqliteConnection source)
    {
        using var backupLock = new FileStream(BackupPath + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        var candidate = BackupPath + ".candidate-" + Guid.NewGuid().ToString("N");
        try
        {
            using (var target = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = candidate, Pooling = false }.ToString()))
            { target.Open(); source.BackupDatabase(target); Contract.Require(Scalar(target, "PRAGMA integrity_check")?.ToString() == "ok"); }
            FaultInjection?.Invoke("backup");
            using (var file = new FileStream(candidate, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) file.Flush(true);
            if (File.Exists(BackupPath)) File.Replace(candidate, BackupPath, null); else File.Move(candidate, BackupPath);
        }
        finally { if (File.Exists(candidate)) File.Delete(candidate); }
    }
    public Task DrainAsync() => Enqueue(() => true);
    internal void MarkDirty() => Dirty = true;
    public static Exception MapError(Exception ex) => ex switch
    {
        AppException => ex,
        SqliteException s when s.SqliteErrorCode is 11 or 26 => new AppException("DATABASE_CORRUPT", "数据库损坏，原文件保留，请选择恢复备份"),
        SqliteException s when s.SqliteErrorCode is 5 or 6 => new AppException("BUSY", "数据库忙，请重试", true),
        SqliteException s when s.SqliteErrorCode == 19 => new AppException("INVALID_PAYLOAD", "数据关联或唯一性约束失败"),
        SqliteException or IOException or UnauthorizedAccessException => new AppException("STORAGE_FAILED", "存储失败，请检查磁盘空间、目录权限或文件占用", true),
        _ => ex
    };
    public static SqliteCommand Command(SqliteConnection c, string sql, SqliteTransaction? tx = null, params (string, object?)[] args)
    { var command = c.CreateCommand(); command.CommandText = sql; command.Transaction = tx; foreach (var (key, value) in args) command.Parameters.AddWithValue(key, value ?? DBNull.Value); return command; }
    public static int Execute(SqliteConnection c, string sql, SqliteTransaction? tx = null, params (string, object?)[] args)
    { using var command = Command(c, sql, tx, args); return command.ExecuteNonQuery(); }
    public static object? Scalar(SqliteConnection c, string sql, SqliteTransaction? tx = null, params (string, object?)[] args)
    { using var command = Command(c, sql, tx, args); return command.ExecuteScalar(); }
    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        lifetime.Cancel(); if (backupTimer != null) await backupTimer;
        queue.Writer.TryComplete(); await worker; lifetime.Dispose();
    }
    private const string SchemaSql = """
        CREATE TABLE IF NOT EXISTS documents(docHash TEXT PRIMARY KEY,documentRevision INTEGER NOT NULL CHECK(documentRevision>=0),pageCount INTEGER NOT NULL,displayName TEXT NOT NULL,schemaVersion INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS source_paths(docHash TEXT NOT NULL REFERENCES documents(docHash),path TEXT NOT NULL,PRIMARY KEY(docHash,path));
        CREATE TABLE IF NOT EXISTS recent_items(docHash TEXT PRIMARY KEY REFERENCES documents(docHash),openedAt TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS migration_decisions(oldHash TEXT NOT NULL REFERENCES documents(docHash),newHash TEXT NOT NULL REFERENCES documents(docHash),decision TEXT NOT NULL,PRIMARY KEY(oldHash,newHash));
        CREATE TABLE IF NOT EXISTS ocr_overrides(docHash TEXT NOT NULL REFERENCES documents(docHash),page INTEGER NOT NULL,mode TEXT NOT NULL,PRIMARY KEY(docHash,page));
        CREATE TABLE IF NOT EXISTS annotations(docHash TEXT NOT NULL REFERENCES documents(docHash),annotationId TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(docHash,annotationId));
        CREATE TABLE IF NOT EXISTS conversations(docHash TEXT NOT NULL REFERENCES documents(docHash),conversationId TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(docHash,conversationId));
        CREATE TABLE IF NOT EXISTS messages(docHash TEXT NOT NULL,messageId TEXT NOT NULL,conversationId TEXT NOT NULL,sequence INTEGER NOT NULL,state TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(docHash,messageId),FOREIGN KEY(docHash,conversationId) REFERENCES conversations(docHash,conversationId) ON DELETE CASCADE);
        CREATE INDEX IF NOT EXISTS messages_sequence ON messages(docHash,conversationId,sequence);
        CREATE TABLE IF NOT EXISTS attachments(docHash TEXT NOT NULL REFERENCES documents(docHash),attachmentId TEXT NOT NULL,mime TEXT NOT NULL,byteLength INTEGER NOT NULL,sha256 TEXT NOT NULL,createdAt TEXT NOT NULL,PRIMARY KEY(docHash,attachmentId));
        CREATE TABLE IF NOT EXISTS attachment_refs(docHash TEXT NOT NULL,messageId TEXT NOT NULL,attachmentId TEXT NOT NULL,PRIMARY KEY(docHash,messageId,attachmentId),FOREIGN KEY(docHash,messageId) REFERENCES messages(docHash,messageId) ON DELETE CASCADE,FOREIGN KEY(docHash,attachmentId) REFERENCES attachments(docHash,attachmentId));
        CREATE TABLE IF NOT EXISTS operations(docHash TEXT NOT NULL REFERENCES documents(docHash),operationId TEXT NOT NULL,payloadHash TEXT NOT NULL,result TEXT NOT NULL CHECK(json_valid(result)),committedRevision INTEGER NOT NULL,PRIMARY KEY(docHash,operationId));
        CREATE TABLE IF NOT EXISTS tool_effects(docHash TEXT NOT NULL,conversationId TEXT NOT NULL,runId TEXT NOT NULL,toolCallId TEXT NOT NULL,result TEXT NOT NULL CHECK(json_valid(result)),PRIMARY KEY(docHash,conversationId,runId,toolCallId),FOREIGN KEY(docHash,conversationId) REFERENCES conversations(docHash,conversationId) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)));
        CREATE TABLE IF NOT EXISTS providers(providerId TEXT PRIMARY KEY,payload TEXT NOT NULL CHECK(json_valid(payload)));
        CREATE TABLE IF NOT EXISTS secrets(providerId TEXT PRIMARY KEY REFERENCES providers(providerId) ON DELETE CASCADE,cipher BLOB NOT NULL);
        """;
}
