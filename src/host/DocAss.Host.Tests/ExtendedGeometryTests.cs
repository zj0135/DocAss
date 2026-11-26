using System.Security.Cryptography;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using UglyToad.PdfPig;
using Xunit;
namespace DocAss.Host.Tests;
public class ExtendedGeometryTests
{
    [Fact]public void EveryNativeCategoryKeepsItsOriginalTruthAndReportsUnsupportedGlyphs()
    {
        var root=ReadingTests.Root;var file=Path.Combine(root,"docs/fixtures/generated/native-matrix.pdf");using var pdf=PdfDocument.Open(file);using var truth=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,"docs/fixtures/generated/native-truth.json")));var reports=new List<object>();
        foreach(var group in truth.RootElement.GetProperty("truth").EnumerateArray().GroupBy(v=>v.GetProperty("case").GetString()))
        {
            var expected=group.ToArray();var page=TextGeometryService.ExtractPage(pdf.GetPage(expected[0].GetProperty("page").GetInt32()),Guid.NewGuid().ToString(),Guid.NewGuid().ToString(),new string('a',64));var missing=expected.Count(g=>g.GetProperty("missingGlyph").GetBoolean());var supported=missing==0;var matched=0;
            if(supported){Assert.Equal(expected.Length,page.Glyphs.Length);for(var i=0;i<expected.Length;i++){
                var q=expected[i].GetProperty("quad").EnumerateArray().Select(v=>v.GetDouble()).ToArray();var baseline=expected[i].GetProperty("baseline").EnumerateArray().Select(v=>v.GetDouble()).ToArray();var actual=page.Glyphs[i];Assert.Equal(expected[i].GetProperty("text").GetString(),actual.Text);
                var angle=Math.Atan2(baseline[3]-baseline[1],baseline[2]-baseline[0]);double[] Projection(double[] quad)=>Enumerable.Range(0,4).Select(n=>quad[n*2]*Math.Cos(angle)+quad[n*2+1]*Math.Sin(angle)).ToArray();var wanted=Projection(q);var observed=Projection(actual.Quad);var width=Math.Max(.01,wanted.Max()-wanted.Min());var error=Math.Max(Math.Abs(wanted.Min()-observed.Min()),Math.Abs(wanted.Max()-observed.Max()))/width;
                if(error<.15)matched++;
            }Assert.True((double)matched/expected.Length>=.98,$"{group.Key}: {matched}/{expected.Length}");}
            else Assert.NotEqual("ready",page.Status);
            reports.Add(new{category=group.Key,expected=expected.Length,missing,matched,supported,status=page.Status});
        }
        var output=Path.Combine(root,"artifacts/reading");Directory.CreateDirectory(output);File.WriteAllText(Path.Combine(output,"extended-native.json"),Json.String(new{sourceSha256=Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file))),categories=reports,humanOverlayReview="pending; automated outline comparison is not a human review"}));
    }
    [Fact]public void LicensedRealPdfHasExtractableTextAndRecordsReliabilityWithoutInventingTruth()
    {
        var file=Path.Combine(ReadingTests.Root,"docs/fixtures/downloads/nist-ir8286.pdf");Assert.True(File.Exists(file),"Run the integration resource acquisition first");using var pdf=PdfDocument.Open(file);Assert.Equal(75,pdf.NumberOfPages);var pages=Enumerable.Range(1,pdf.NumberOfPages).Select(p=>TextGeometryService.ExtractPage(pdf.GetPage(p),Guid.NewGuid().ToString(),Guid.NewGuid().ToString(),new string('a',64))).ToArray();Assert.Contains(pages,p=>string.Concat(p.Glyphs.Select(g=>g.Text)).Contains("Cybersecurity"));
        File.WriteAllText(Path.Combine(ReadingTests.Root,"artifacts/reading/nist-native.json"),Json.String(new{sha256=Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file))),pages=pages.Select(p=>new{p.PageInfo.Page,p.Status,glyphs=p.Glyphs.Length}),g1Measured=false,reason="No independent human glyph coordinates supplied for this real publication"}));
    }
}
