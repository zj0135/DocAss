using System.Globalization;
using System.Text;
using DocAss.Host.Contracts;

namespace DocAss.Host.Verification;

public sealed record OcrGeometryScore(int Page,string Category,int Expected,int Recognized,int Hits,double HitRate,string[] MissedIds,bool Meets95Percent);
public static class OcrGeometryAcceptance
{
    public static OcrGeometryScore Score(OcrTruthCorpus corpus,OcrTruthPage page,OcrResult result)
    {
        var predictions=result.Lines.SelectMany(l=>l.Glyphs).Where(g=>!string.IsNullOrWhiteSpace(g.Text)).ToArray();
        var assigned=Enumerable.Repeat(-1,predictions.Length).ToArray();
        var candidates=page.Characters.Select(c=>Enumerable.Range(0,predictions.Length).Where(i=>predictions[i].Text==c.Text&&Contains(c.Quad,Center(corpus,predictions[i]))).ToArray()).ToArray();
        // One prediction may satisfy only one truth character; missed/invalid/misread characters stay in the denominator.
        bool Match(int truth,HashSet<int> seen){foreach(var prediction in candidates[truth])if(seen.Add(prediction)&&(assigned[prediction]<0||Match(assigned[prediction],seen))){assigned[prediction]=truth;return true;}return false;}
        var hits=Enumerable.Range(0,page.Characters.Length).Count(i=>Match(i,[]));var matched=assigned.Where(i=>i>=0).ToHashSet();
        var ratio=page.Characters.Length==0?0:(double)hits/page.Characters.Length;
        return new(page.Page,page.Category,page.Characters.Length,predictions.Length,hits,ratio,page.Characters.Where((_,i)=>!matched.Contains(i)).Select(c=>c.Id+":"+c.Text).ToArray(),ratio>=.95);
    }
    private static double[] Center(OcrTruthCorpus corpus,Glyph g)=>[new[]{g.Quad[0],g.Quad[2],g.Quad[4],g.Quad[6]}.Average()*corpus.Dpi/72,corpus.Height-new[]{g.Quad[1],g.Quad[3],g.Quad[5],g.Quad[7]}.Average()*corpus.Dpi/72];
    private static bool Contains(double[] q,double[] p){var positive=false;var negative=false;for(var i=0;i<4;i++){var j=(i+1)%4;var cross=(q[j*2]-q[i*2])*(p[1]-q[i*2+1])-(q[j*2+1]-q[i*2+1])*(p[0]-q[i*2]);positive|=cross>1e-6;negative|=cross< -1e-6;}return !(positive&&negative);}
    public static void Overlay(string sampleRoot,string output,OcrTruthCorpus corpus,OcrTruthPage page,OcrResult result)
    {
        string N(double value)=>value.ToString("0.###",CultureInfo.InvariantCulture);
        var svg=new StringBuilder($"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{corpus.Width}\" height=\"{corpus.Height}\" viewBox=\"0 0 {corpus.Width} {corpus.Height}\">");
        svg.Append($"<image width=\"{corpus.Width}\" height=\"{corpus.Height}\" href=\"data:image/png;base64,{Convert.ToBase64String(File.ReadAllBytes(Path.Combine(sampleRoot,page.Image)))}\"/>");
        foreach(var truth in page.Characters)svg.Append($"<polygon points=\"{string.Join(' ',Enumerable.Range(0,4).Select(i=>N(truth.Quad[i*2])+","+N(truth.Quad[i*2+1])))}\" fill=\"none\" stroke=\"#2563eb\" stroke-width=\"1\"/>");
        foreach(var glyph in result.Lines.SelectMany(l=>l.Glyphs).Where(g=>!string.IsNullOrWhiteSpace(g.Text))){var center=Center(corpus,glyph);var color=page.Characters.Any(c=>c.Text==glyph.Text&&Contains(c.Quad,center))?"#16a34a":"#dc2626";svg.Append($"<circle cx=\"{N(center[0])}\" cy=\"{N(center[1])}\" r=\"3\" fill=\"{color}\"/>");}
        svg.Append("</svg>");File.WriteAllText(output,svg.ToString());
    }
}
