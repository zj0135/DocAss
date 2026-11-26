using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DocAss.Host.Contracts;

public sealed class AppException(string code, string message, bool retryable = false) : Exception(message)
{
    public string Code { get; } = code;
    public bool Retryable { get; } = retryable;
    public object ToDto() => new { code = Code, message = Message, retryable = Retryable };
}

public static class Json
{
    public static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    public static JsonElement Element(object value) => JsonSerializer.SerializeToElement(value, Options);
    public static string String(object value) => JsonSerializer.Serialize(value, Options);
    public static string Canonical(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => "{" + string.Join(",", value.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal).Select(p => Quote(p.Name) + ":" + Canonical(p.Value))) + "}",
        JsonValueKind.Array => "[" + string.Join(",", value.EnumerateArray().Select(Canonical)) + "]",
        JsonValueKind.Number => Number(value.GetDouble()),
        JsonValueKind.String => Quote(value.GetString()!),
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        JsonValueKind.Null => "null",
        _ => throw new AppException("INVALID_PAYLOAD", "不支持的 JSON 值")
    };
    private static string Number(double n)
    {
        if (!double.IsFinite(n)) throw new AppException("INVALID_PAYLOAD", "数值必须有限");
        if (n == 0) return "0";
        var s = n.ToString("R", CultureInfo.InvariantCulture).ToLowerInvariant();
        if (!s.Contains('e')) return s;
        var parts = s.Split('e'); var exponent = int.Parse(parts[1], CultureInfo.InvariantCulture);
        if (Math.Abs(n) >= 1e-6 && Math.Abs(n) < 1e21)
        {
            var sign = n < 0 ? "-" : ""; var digits = parts[0].TrimStart('-').Replace(".", ""); var point = exponent + 1;
            return sign + (point <= 0 ? "0." + new string('0', -point) + digits : point >= digits.Length ? digits + new string('0', point - digits.Length) : digits[..point] + "." + digits[point..]);
        }
        return parts[0] + "e" + (exponent >= 0 ? "+" : "-") + Math.Abs(exponent);
    }
    private static string Quote(string value)
    {
        var output = new StringBuilder("\"");
        for (var i = 0; i < value.Length; i++)
        {
            var c = value[i];
            switch (c)
            {
                case '"': output.Append("\\\""); break;
                case '\\': output.Append("\\\\"); break;
                case '\b': output.Append("\\b"); break;
                case '\f': output.Append("\\f"); break;
                case '\n': output.Append("\\n"); break;
                case '\r': output.Append("\\r"); break;
                case '\t': output.Append("\\t"); break;
                default:
                    if (char.IsHighSurrogate(c) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1])) { output.Append(c).Append(value[++i]); }
                    else if (c < 0x20 || char.IsSurrogate(c)) output.Append("\\u").Append(((int)c).ToString("x4"));
                    else output.Append(c);
                    break;
            }
        }
        return output.Append('"').ToString();
    }
    public static string Hash(JsonElement value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(Canonical(value))));
    public static string PayloadHash(string docHash, JsonElement command) => Hash(Element(new { schemaVersion = 1, docHash, command }));
}

public static class Contract
{
    private static readonly JsonElement Schema = ReadSchema();
    private static JsonElement ReadSchema()
    {
        var assembly = typeof(Contract).Assembly;
        using var stream = assembly.GetManifestResourceStream(assembly.GetManifestResourceNames().Single(n => n.EndsWith("contracts.schema.json")))!;
        return JsonDocument.Parse(stream).RootElement.Clone();
    }
    public static void Check(string name, JsonElement value)
    {
        Validate(Schema.GetProperty("$defs").GetProperty(name), value, 0);
        Semantic(name, value);
    }
    public static void Require(bool condition, string message = "数据不符合协议")
    { if (!condition) throw new AppException("INVALID_PAYLOAD", message); }
    public static void Fields(JsonElement value, params string[] fields)
    {
        Require(value.ValueKind == JsonValueKind.Object);
        Require(value.EnumerateObject().Count() == fields.Length && fields.All(f => value.TryGetProperty(f, out _)));
        Require(value.EnumerateObject().Select(p => p.Name).Distinct().Count() == fields.Length);
    }
    private static void Validate(JsonElement schema, JsonElement value, int depth)
    {
        Require(depth < 64, "嵌套层级过深");
        if (schema.TryGetProperty("$ref", out var reference))
        { var name = reference.GetString()!.Split('/')[^1]; Check(name, value); return; }
        if (schema.TryGetProperty("anyOf", out var variants))
        {
            foreach (var variant in variants.EnumerateArray())
                try { Validate(variant, value, depth + 1); return; } catch (AppException) { }
            throw new AppException("INVALID_PAYLOAD", "数据类型不匹配");
        }
        if (schema.TryGetProperty("const", out var constant)) Require(Json.Canonical(constant) == Json.Canonical(value));
        if (schema.TryGetProperty("enum", out var values)) Require(values.EnumerateArray().Any(v => Json.Canonical(v) == Json.Canonical(value)));
        if (!schema.TryGetProperty("type", out var type)) return;
        switch (type.GetString())
        {
            case "object":
                Require(value.ValueKind == JsonValueKind.Object);
                var properties = value.EnumerateObject().ToArray();
                Require(properties.Select(p => p.Name).Distinct().Count() == properties.Length, "重复字段");
                if (schema.TryGetProperty("required", out var required)) foreach (var key in required.EnumerateArray()) Require(value.TryGetProperty(key.GetString()!, out _));
                foreach (var property in properties)
                {
                    if (schema.TryGetProperty("properties", out var definitions) && definitions.TryGetProperty(property.Name, out var child)) Validate(child, property.Value, depth + 1);
                    else Require(!schema.TryGetProperty("additionalProperties", out var additional) || additional.GetBoolean(), "未知字段");
                }
                break;
            case "array":
                Require(value.ValueKind == JsonValueKind.Array);
                Require(value.GetArrayLength() >= schema.GetProperty("minItems").GetInt32() && value.GetArrayLength() <= schema.GetProperty("maxItems").GetInt32());
                foreach (var item in value.EnumerateArray()) Validate(schema.GetProperty("items"), item, depth + 1);
                break;
            case "string":
                Require(value.ValueKind == JsonValueKind.String);
                var text = value.GetString()!;
                if (schema.TryGetProperty("maxLength", out var length)) Require(text.EnumerateRunes().Count() <= length.GetInt32());
                if (schema.TryGetProperty("pattern", out var pattern)) Require(Regex.IsMatch(text, pattern.GetString()!, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)));
                break;
            case "integer":
            case "number":
                Require(value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out _));
                var number = value.GetDouble(); Require(double.IsFinite(number));
                if (type.GetString() == "integer") Require(number == Math.Truncate(number));
                if (schema.TryGetProperty("minimum", out var min)) Require(number >= min.GetDouble());
                if (schema.TryGetProperty("maximum", out var max)) Require(number <= max.GetDouble());
                if (schema.TryGetProperty("exclusiveMinimum", out var exclusive)) Require(number > exclusive.GetDouble());
                break;
            case "boolean": Require(value.ValueKind is JsonValueKind.True or JsonValueKind.False); break;
            case "null": Require(value.ValueKind == JsonValueKind.Null); break;
        }
    }
    private static void Semantic(string name, JsonElement v)
    {
        if (name == "Box") Require(v[0].GetDouble() < v[2].GetDouble() && v[1].GetDouble() < v[3].GetDouble(), "矩形必须具有面积");
        if (name == "Quad")
        {
            var a = v.EnumerateArray().Select(x => x.GetDouble()).ToArray();
            for (var i = 0; i < 4; i++)
            {
                var j = (i + 1) % 4; var k = (i + 2) % 4;
                Require((a[2 * j] - a[2 * i]) * (a[2 * k + 1] - a[2 * j + 1]) - (a[2 * j + 1] - a[2 * i + 1]) * (a[2 * k] - a[2 * j]) > 0, "四边形必须逆时针且不交叉");
                Require(a[2 * i + 1] > a[1] || (a[2 * i + 1] == a[1] && a[2 * i] >= a[0]), "四边形起点不规范");
            }
        }
        if (name == "Affine") Require(Math.Abs(v[0].GetDouble() * v[3].GetDouble() - v[1].GetDouble() * v[2].GetDouble()) > 1e-12, "仿射矩阵不可逆");
        if (name == "TextRange") Require(v.GetProperty("start").GetInt32() < v.GetProperty("end").GetInt32(), "文本范围必须为非空半开区间");
        if (name == "DocHandle") Require(v.GetProperty("docHash").GetString() == v.GetProperty("contentRevision").GetString());
        if (name == "Annotation")
        {
            string[] required = v.GetProperty("type").GetString() switch
            {
                "highlight" or "underline" => ["quads", "textAnchor"],
                "note" => ["anchor"],
                "freetext" => ["text", "fontSize", "fontFamily", "alignment"],
                "ink" => ["paths", "width"],
                "rect" => ["strokeWidth"],
                "arrow" => ["from", "to", "strokeWidth", "endStyle"],
                _ => []
            };
            foreach (var key in required) Require(v.TryGetProperty(key, out _));
            if (v.TryGetProperty("quads", out var quads)) Require(quads.GetArrayLength() > 0);
            if (v.TryGetProperty("paths", out var paths)) Require(paths.GetArrayLength() > 0);
        }
        if (name == "PageText")
        {
            var text = v.GetProperty("text").GetString()!;
            var glyphIds = v.GetProperty("glyphs").EnumerateArray().Select(g => g.GetProperty("id").GetString()!).ToHashSet();
            Require(glyphIds.Count == v.GetProperty("glyphs").GetArrayLength());
            var lines = v.GetProperty("lines").EnumerateArray().Select(g => g.GetProperty("id").GetString()!).ToHashSet();
            foreach (var item in v.GetProperty("spans").EnumerateArray().Concat(v.GetProperty("lines").EnumerateArray()))
            {
                var range = item.GetProperty("range"); var start = range.GetProperty("start").GetInt32(); var end = range.GetProperty("end").GetInt32();
                Require(end <= text.Length && !(start > 0 && start < text.Length && char.IsLowSurrogate(text[start])) && !(end < text.Length && char.IsLowSurrogate(text[end])), "UTF-16 范围越界或截断字符");
                foreach (var id in item.GetProperty("glyphIds").EnumerateArray()) Require(glyphIds.Contains(id.GetString()!));
                if (item.TryGetProperty("lineId", out var line)) Require(lines.Contains(line.GetString()!));
            }
        }
        if (name == "Provider")
        {
            Require(Uri.TryCreate(v.GetProperty("baseUrl").GetString(), UriKind.Absolute, out var uri));
            Require(uri!.UserInfo == "" && uri.Query == "" && uri.Fragment == "" && (uri.Scheme == "https" || (uri.Scheme == "http" && (uri.Host == "localhost" || uri.Host == "127.0.0.1"))), "提供方地址必须为 HTTPS 或本机 HTTP");
            var models = v.GetProperty("models").EnumerateArray().Select(m => m.GetProperty("modelId").GetString()).ToArray(); Require(models.Distinct().Count() == models.Length, "模型 ID 不能重复");
            var raw = v.GetProperty("baseUrl").GetString()!; Require(!raw.Contains('%') && !raw.Contains('\\') && !raw.Split('/').Any(s => s is "." or ".."), "提供方路径不允许转义或父目录");
        }
    }
}

public sealed record DocHandle(string DocId, string DocHash, string FileName, string Kind, long ByteLength, string Access, string ContentRevision);
public sealed record CommitResult(string OperationId, long CommittedRevision, string PayloadHash);
