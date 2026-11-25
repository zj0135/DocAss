using UglyToad.PdfPig;
using Xunit;

namespace DocAss.Host.Tests;
public class PdfFixtureTests
{
    private static string Fixture(string name)
    {
        var root=new DirectoryInfo(AppContext.BaseDirectory);while(root!=null&&!File.Exists(Path.Combine(root.FullName,"DocAss.sln")))root=root.Parent;
        var file=Path.Combine(root!.FullName,"docs","fixtures","generated",name);
        Assert.True(File.Exists(file),"Run pnpm fixtures:setup and pnpm fixtures first");return file;
    }
    [Fact] public void PasswordFixtureRejectsWrongPasswordAndOpensWithCorrectPassword()
    {
        Assert.ThrowsAny<Exception>(()=>PdfDocument.Open(Fixture("password.pdf"),new ParsingOptions{Password="wrong"}));
        using var pdf=PdfDocument.Open(Fixture("password.pdf"),new ParsingOptions{Password="fixture-reader"});Assert.Equal(1,pdf.NumberOfPages);Assert.Contains("Native header",pdf.GetPage(1).Text);
    }
    [Fact] public void NativeTjSampleHasIndependentlyPositionedLetters()
    {
        using var pdf=PdfDocument.Open(Fixture("native-matrix.pdf"));var letters=pdf.GetPage(10).Letters;Assert.Equal("ABCDEF",string.Concat(letters.Select(l=>l.Value)));
        using var truth=System.Text.Json.JsonDocument.Parse(File.ReadAllText(Fixture("tj-counterexample.json")));var glyphs=truth.RootElement.GetProperty("glyphs").EnumerateArray().ToArray();
        for(var i=0;i<glyphs.Length;i++)Assert.InRange(Math.Abs(letters[i].StartBaseLine.X-glyphs[i].GetProperty("start").GetDouble()),0,.02);
    }
}
