using System.Text;
using DocAss.Host.Contracts;

namespace DocAss.Host.Http;

public static class BoundedRead
{
    public static async Task<byte[]> ReadAsync(Stream stream, int limit, CancellationToken token)
    {
        using var memory = new MemoryStream(); var buffer = new byte[65536]; int count;
        while ((count = await stream.ReadAsync(buffer, token)) > 0)
        {
            if (memory.Length + count > limit) throw new AppException("INVALID_PAYLOAD", "请求体超出大小限制");
            await memory.WriteAsync(buffer.AsMemory(0, count), token);
        }
        return memory.ToArray();
    }
}
public sealed record ResourceRequest(string Method, string Url, string? Range = null, string? Mime = null, Stream? Body = null);
public sealed record ResourceResponse(int Status, string Mime, byte[] Body, Dictionary<string, string>? Headers = null)
{
    public Stream? BodyStream { get; init; }
    public static ResourceResponse Json(int status, object data) => new(status, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(Contracts.Json.String(data)));
}
public sealed class HostResourceHandler(string root, string origin)
{
    private readonly Dictionary<(string, string), Func<ResourceRequest, CancellationToken, Task<ResourceResponse>>> endpoints = new();
    public Func<ResourceRequest, CancellationToken, Task<ResourceResponse>>? BusinessEndpoint { get; set; }
    public string? LoopbackOrigin { get; set; }
    public void Register(string method, string path, Func<ResourceRequest, CancellationToken, Task<ResourceResponse>> handler) => endpoints.Add((method, path), handler);
    public async Task<ResourceResponse> HandleAsync(ResourceRequest request, CancellationToken token)
    {
        try
        {
            if (!Uri.TryCreate(request.Url, UriKind.Absolute, out var uri) || uri.GetLeftPart(UriPartial.Authority) != origin) return ResourceResponse.Json(403, new { error = "FORBIDDEN" });
            var path = DecodePath(request.Url);
            if (path == "/_host/ping" && request.Method == "GET") return ResourceResponse.Json(200, new { v = 1, status = "ready" });
            if (endpoints.TryGetValue((request.Method, path), out var handler)) return await handler(request, token);
            if (path.StartsWith("/_host/", StringComparison.Ordinal)) return BusinessEndpoint == null ? ResourceResponse.Json(404, new { error = "NOT_FOUND" }) : await BusinessEndpoint(request, token);
            if (request.Method != "GET") return ResourceResponse.Json(405, new { error = "METHOD_NOT_ALLOWED" });
            var fullRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            var file = Path.GetFullPath(Path.Combine(fullRoot, path == "/" ? "index.html" : path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
            if (!file.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase)) return ResourceResponse.Json(403, new { error = "FORBIDDEN" });
            // Reparse points must not turn an in-root URL into an arbitrary filesystem read.
            for (var current = file; current.Length >= fullRoot.TrimEnd(Path.DirectorySeparatorChar).Length; current = Path.GetDirectoryName(current)!)
                if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) return ResourceResponse.Json(403, new { error = "FORBIDDEN" });
            if (!File.Exists(file)) return ResourceResponse.Json(404, new { error = "NOT_FOUND" });
            if (new FileInfo(file).Length > 32 * 1024 * 1024) return ResourceResponse.Json(413, new { error = "TOO_LARGE" });
            var bytes = await File.ReadAllBytesAsync(file, token);
            var response = Bytes(bytes, Mime(file), request.Range);
            var headers = response.Headers ?? new();
            headers["X-Content-Type-Options"] = "nosniff";
            headers["Content-Security-Policy"] = $"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; worker-src 'self'; connect-src 'self' {LoopbackOrigin}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
            return response with { Headers = headers };
        }
        catch (AppException ex) { return ResourceResponse.Json(ex.Code == "FORBIDDEN" ? 403 : 400, ex.ToDto()); }
        catch (Exception ex) when (ex is System.Text.Json.JsonException or InvalidOperationException or KeyNotFoundException) { return ResourceResponse.Json(400, new { error = "INVALID_PAYLOAD" }); }
        catch (OperationCanceledException) { return ResourceResponse.Json(499, new { error = "CANCELLED" }); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return ResourceResponse.Json(500, new { error = "RESOURCE_FAILED" }); }
    }
    public static string DecodePath(string url)
    {
        var start = url.IndexOf('/', url.IndexOf("://", StringComparison.Ordinal) + 3);
        var raw = start < 0 ? "/" : url[start..].Split('?', '#')[0];
        var path = Uri.UnescapeDataString(raw);
        if (path.Contains('%') || path.Contains('\\') || path.Contains(':') || path.Any(char.IsControl) || path.Split('/').Any(s => s is "." or ".." || s.EndsWith('.') || s.EndsWith(' '))) throw new AppException("FORBIDDEN", "不允许的资源路径");
        return path;
    }
    public static ResourceResponse Bytes(byte[] bytes, string mime, string? range)
    {
        var headers = new Dictionary<string, string> { ["Accept-Ranges"] = "bytes", ["Cache-Control"] = "no-store" };
        if (range == null) { headers["Content-Length"] = bytes.Length.ToString(); return new(200, mime, bytes, headers); }
        ResourceResponse Invalid() { headers["Content-Range"] = $"bytes */{bytes.Length}"; return new(416, mime, [], headers); }
        if (!range.StartsWith("bytes=", StringComparison.Ordinal) || range.Contains(',')) return Invalid();
        var parts = range[6..].Split('-'); if (parts.Length != 2 || bytes.Length == 0) return Invalid();
        long start; long end;
        if (parts[0] == "")
        { if (!long.TryParse(parts[1], out var suffix) || suffix <= 0) return Invalid(); start = Math.Max(0, bytes.Length - suffix); end = bytes.Length - 1; }
        else
        { if (!long.TryParse(parts[0], out start) || start < 0 || start >= bytes.Length) return Invalid(); if (parts[1] == "") end = bytes.Length - 1; else if (!long.TryParse(parts[1], out end) || end < start) return Invalid(); end = Math.Min(end, bytes.Length - 1); }
        headers["Content-Range"] = $"bytes {start}-{end}/{bytes.Length}"; headers["Content-Length"] = (end - start + 1).ToString();
        return new(206, mime, bytes[(int)start..((int)end + 1)], headers);
    }
    public static async Task<ResourceResponse> FileRangeAsync(string path, string mime, string? range, CancellationToken token)
    {
        var length = new FileInfo(path).Length;
        var headers = new Dictionary<string, string> { ["Accept-Ranges"] = "bytes", ["Cache-Control"] = "no-store", ["Content-Length"] = length.ToString() };
        if (range == null) return new(200, mime, [], headers) { BodyStream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.Asynchronous) };
        ResourceResponse Invalid() { headers["Content-Range"] = $"bytes */{length}"; headers["Content-Length"] = "0"; return new(416, mime, [], headers); }
        if (!range.StartsWith("bytes=") || range.Contains(',')) return Invalid();
        var parts = range[6..].Split('-'); if (parts.Length != 2 || length == 0) return Invalid();
        long start, end;
        if (parts[0] == "") { if (!long.TryParse(parts[1], out var suffix) || suffix <= 0) return Invalid(); start = Math.Max(0, length - suffix); end = length - 1; }
        else { if (!long.TryParse(parts[0], out start) || start < 0 || start >= length) return Invalid(); if (parts[1] == "") end = length - 1; else if (!long.TryParse(parts[1], out end) || end < start) return Invalid(); end = Math.Min(end, length - 1); }
        // PDF.js can coalesce a font stream into a multi-megabyte Range. Serve
        // large ranges as seekable slices, keeping allocation independent of size.
        if (end - start + 1 > 8 * 1024 * 1024)
        {
            headers["Content-Range"] = $"bytes {start}-{end}/{length}"; headers["Content-Length"] = (end - start + 1).ToString();
            return new(206, mime, [], headers) { BodyStream = new FileSliceStream(path, start, end - start + 1) };
        }
        var bytes = new byte[checked((int)(end - start + 1))];
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.Asynchronous);
        stream.Position = start; await stream.ReadExactlyAsync(bytes, token);
        headers["Content-Range"] = $"bytes {start}-{end}/{length}"; headers["Content-Length"] = bytes.Length.ToString();
        return new(206, mime, bytes, headers);
    }
    public static string Mime(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    { ".html" => "text/html; charset=utf-8", ".js" or ".mjs" => "text/javascript; charset=utf-8", ".css" => "text/css; charset=utf-8", ".json" => "application/json", ".wasm" => "application/wasm", ".svg" => "image/svg+xml", ".png" => "image/png", ".woff2" => "font/woff2", _ => "application/octet-stream" };
}

internal sealed class FileSliceStream : Stream
{
    private readonly FileStream file; private readonly long start, length; private long position;
    public FileSliceStream(string path, long start, long length) { file = new(path, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.Asynchronous); this.start = start; this.length = length; file.Position = start; }
    public override bool CanRead => true; public override bool CanSeek => true; public override bool CanWrite => false; public override long Length => length;
    public override long Position { get => position; set => Seek(value, SeekOrigin.Begin); }
    public override int Read(byte[] buffer, int offset, int count) { var n = file.Read(buffer, offset, (int)Math.Min(count, length - position)); position += n; return n; }
    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default) { var n = await file.ReadAsync(buffer[..(int)Math.Min(buffer.Length, length - position)], token); position += n; return n; }
    public override long Seek(long offset, SeekOrigin origin) { var target = origin switch { SeekOrigin.Begin => offset, SeekOrigin.Current => position + offset, _ => length + offset }; if (target < 0 || target > length) throw new IOException("Range seek outside slice"); file.Position = start + target; return position = target; }
    public override void Flush() { }
    public override void SetLength(long value) => throw new NotSupportedException(); public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    protected override void Dispose(bool disposing) { if (disposing) file.Dispose(); base.Dispose(disposing); }
}
