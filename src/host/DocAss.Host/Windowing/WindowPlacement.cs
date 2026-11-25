namespace DocAss.Host.Windowing;

public sealed record Bounds(double Left, double Top, double Width, double Height);
public static class WindowPlacement
{
    public static Bounds SelectWorkArea(Bounds window,IReadOnlyList<Bounds> areas)
    {
        if(areas.Count==0)throw new ArgumentException("No monitor work area");
        return areas.OrderByDescending(a=>Math.Max(0,Math.Min(a.Left+a.Width,window.Left+window.Width)-Math.Max(a.Left,window.Left))*Math.Max(0,Math.Min(a.Top+a.Height,window.Top+window.Height)-Math.Max(a.Top,window.Top)))
            .ThenBy(a=>Math.Pow(a.Left+a.Width/2-window.Left-window.Width/2,2)+Math.Pow(a.Top+a.Height/2-window.Top-window.Height/2,2)).First();
    }
    public static Bounds Clamp(Bounds window, Bounds workArea)
    {
        var width = Math.Clamp(window.Width, Math.Min(1100, workArea.Width), workArea.Width);
        var height = Math.Clamp(window.Height, Math.Min(700, workArea.Height), workArea.Height);
        return new(Math.Clamp(window.Left, workArea.Left, workArea.Left + workArea.Width - width), Math.Clamp(window.Top, workArea.Top, workArea.Top + workArea.Height - height), width, height);
    }
}
