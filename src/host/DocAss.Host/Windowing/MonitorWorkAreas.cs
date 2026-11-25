using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media;

namespace DocAss.Host.Windowing;
internal static class MonitorWorkAreas
{
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left,Top,Right,Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct MonitorInfo { public int Size; public Rect Monitor,Work; public int Flags; }
    private delegate bool Enumerate(nint monitor,nint hdc,ref Rect rectangle,nint data);
    [DllImport("user32.dll")] private static extern bool EnumDisplayMonitors(nint hdc,nint clip,Enumerate callback,nint data);
    [DllImport("user32.dll",CharSet=CharSet.Auto)] private static extern bool GetMonitorInfo(nint monitor,ref MonitorInfo info);
    public static IReadOnlyList<Bounds> Get(Window window)
    {
        var scale=VisualTreeHelper.GetDpi(window);var result=new List<Bounds>();
        EnumDisplayMonitors(0,0,(nint monitor,nint _,ref Rect rectangle,nint data)=>{var info=new MonitorInfo{Size=Marshal.SizeOf<MonitorInfo>()};if(GetMonitorInfo(monitor,ref info))result.Add(new(info.Work.Left/scale.DpiScaleX,info.Work.Top/scale.DpiScaleY,(info.Work.Right-info.Work.Left)/scale.DpiScaleX,(info.Work.Bottom-info.Work.Top)/scale.DpiScaleY));return true;},0);
        if(result.Count==0){var r=SystemParameters.WorkArea;result.Add(new(r.Left,r.Top,r.Width,r.Height));}return result;
    }
}
