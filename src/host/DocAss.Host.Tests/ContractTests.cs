using System.Text.Json;
using DocAss.Host.Contracts;
using Xunit;

namespace DocAss.Host.Tests;
public class ContractTests
{
    public static IEnumerable<object[]> Fixtures()
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "contract-fixtures.json")));
        return json.RootElement.EnumerateArray().Select(f => new object[] { f.GetProperty("name").GetString()!, f.GetProperty("schema").GetString()!, f.GetProperty("valid").GetBoolean(), f.GetProperty("value").GetRawText() }).ToArray();
    }
    [Theory, MemberData(nameof(Fixtures))]
    public void SharedFixture(string name, string schema, bool valid, string raw)
    {
        Assert.NotEmpty(name);
        using var doc = JsonDocument.Parse(raw);
        if (valid) {
            Contract.Check(schema, doc.RootElement);
            var dtoType=typeof(Contract).Assembly.GetType("DocAss.Host.Contracts."+(schema=="CommitCommand"?"CommitCommandDto":schema));
            var dto=dtoType==null?(object)doc.RootElement:JsonSerializer.Deserialize(raw,dtoType,Json.Options)!;
            using var roundtrip = JsonDocument.Parse(Json.String(dto)); Contract.Check(schema, roundtrip.RootElement);
        }
        else Assert.Throws<AppException>(() => Contract.Check(schema, doc.RootElement));
    }
    [Fact] public void NonFiniteJsonRejected() => Assert.ThrowsAny<JsonException>(() => JsonDocument.Parse("[0,0,NaN,10]"));
    [Fact] public void CanonicalNumericAndUnicodeRules() => Assert.Equal("{\"a\":1e-7,\"text\":\"中文😀\",\"z\":0}", Json.Canonical(Json.Element(new { z = -0d, text = "中文😀", a = 1e-7 })));
    [Fact] public void CanonicalHashesMatchJavascriptVectors()
    {
        using var vectors=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"canonical-fixtures.json")));
        foreach(var vector in vectors.RootElement.EnumerateArray()){Assert.Equal(vector.GetProperty("canonical").GetString(),Json.Canonical(vector.GetProperty("value")));Assert.Equal(vector.GetProperty("sha256").GetString(),Json.Hash(vector.GetProperty("value")));}
    }
}
