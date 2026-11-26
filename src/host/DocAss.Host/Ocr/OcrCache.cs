using System.Text.Json;
using DocAss.Host.Contracts;
namespace DocAss.Host.Ocr;

public sealed class OcrCache(string root)
{
    private readonly object gate = new();
    public long Bytes { get { lock (gate) return Directory.Exists(root) ? new DirectoryInfo(root).GetFiles("*.json").Sum(f => f.Length) : 0; } }
    public OcrResult? Read(string key)
    {
        lock (gate) try { var path = Path.Combine(root, key + ".json"); if (!File.Exists(path) || new FileInfo(path).Length > 16 * 1024 * 1024) return null; using var json = JsonDocument.Parse(File.ReadAllBytes(path)); Contract.Check("OcrResult", json.RootElement.GetProperty("result")); var result = json.RootElement.GetProperty("result"); if (Json.Hash(result) != json.RootElement.GetProperty("checksum").GetString()) return null; var value = result.Deserialize<OcrResult>(Json.Options)!; if (value.Profile.Fingerprint != key) return null; File.SetLastWriteTimeUtc(path, DateTime.UtcNow); return value with { Cached = true }; } catch (Exception e) when (e is IOException or JsonException or AppException or InvalidOperationException or KeyNotFoundException) { return null; }
    }
    public void Write(OcrResult value)
    {
        Contract.Check("OcrResult", Json.Element(value)); lock (gate) { Directory.CreateDirectory(root); var path = Path.Combine(root, value.Profile.Fingerprint + ".json"); var temp = path + ".tmp"; try { var bytes = System.Text.Encoding.UTF8.GetBytes(Json.String(new { result = value, checksum = Json.Hash(Json.Element(value)) })); if (bytes.Length > 16 * 1024 * 1024) throw new AppException("OCR_TOO_LARGE", "OCR 结果超出缓存上限"); using (var file = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None)) { file.Write(bytes); file.Flush(true); } File.Move(temp, path, true); } finally { if (File.Exists(temp)) File.Delete(temp); } }
    }
    public long Collect(long budget, ISet<string> protectedKeys)
    {
        lock (gate) { if (!Directory.Exists(root)) return 0; var files = new DirectoryInfo(root).GetFiles("*.json").OrderBy(f => f.LastWriteTimeUtc).ToArray(); var size = files.Sum(f => f.Length); long removed = 0; foreach (var f in files) { if (size <= budget) break; if (protectedKeys.Contains(Path.GetFileNameWithoutExtension(f.Name))) continue; size -= f.Length; removed += f.Length; f.Delete(); } return removed; }
    }
}
