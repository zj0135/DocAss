using DocAss.Host.Contracts;
using Microsoft.Data.Sqlite;

namespace DocAss.Host.Storage;

public sealed record BackupInfo(DateTime ModifiedUtc, Dictionary<string, long> DocumentRevisions);
public static class RecoveryService
{
    public static BackupInfo Inspect(string backupPath)
    {
        using var c = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = backupPath, Mode = SqliteOpenMode.ReadOnly, Pooling = false }.ToString()); c.Open();
        Contract.Require(StorageService.Scalar(c, "PRAGMA integrity_check")?.ToString() == "ok", "备份校验失败");
        var revisions = new Dictionary<string, long>();
        if (StorageService.Scalar(c, "SELECT name FROM sqlite_master WHERE name='documents'") != null)
        {
            using var cmd = StorageService.Command(c, "SELECT docHash,documentRevision FROM documents"); using var r = cmd.ExecuteReader();
            while (r.Read()) revisions.Add(r.GetString(0), r.GetInt64(1));
        }
        return new(File.GetLastWriteTimeUtc(backupPath), revisions);
    }
    // Only called from the native recovery screen after explicit user confirmation, with the store closed.
    public static void Restore(string databasePath, bool confirmed)
    {
        if (!confirmed) throw new AppException("FORBIDDEN", "恢复需要用户明确选择");
        var backup = databasePath + ".backup"; Inspect(backup);
        using var maintenance = new FileStream(databasePath + ".lease", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        var candidate = databasePath + ".restore-" + Guid.NewGuid().ToString("N");
        File.Copy(backup, candidate);
        var archive = databasePath + ".replaced-" + DateTime.UtcNow.ToString("yyyyMMddHHmmssfff");
        var marker = databasePath + ".restore-pending";
        var moved = new List<string>();
        var replaced = false;
        try
        {
            using (var file = new FileStream(candidate, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) file.Flush(true);
            using (var file = new FileStream(marker, FileMode.Create, FileAccess.Write, FileShare.None)) { var bytes=System.Text.Encoding.UTF8.GetBytes(archive); file.Write(bytes); file.Flush(true); }
            // Retain the original database and its journal for diagnosis instead of silently clearing it.
            foreach (var suffix in new[] { "-wal", "-shm" }) if (File.Exists(databasePath + suffix)) { File.Move(databasePath + suffix, archive + suffix); moved.Add(suffix); }
            if (File.Exists(databasePath)) File.Replace(candidate, databasePath, archive); else File.Move(candidate, databasePath);
            replaced = true;
            File.Delete(marker);
        }
        catch
        {
            if (!replaced) { foreach(var suffix in moved) File.Move(archive+suffix,databasePath+suffix); if(File.Exists(marker))File.Delete(marker); }
            throw;
        }
        finally { if (File.Exists(candidate)) File.Delete(candidate); }
    }
}
