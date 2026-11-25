using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace DocAss.Host.Verification;
internal static class NativeInput
{
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] private struct Mouse { public int X,Y;public uint Data,Flags,Time;public nuint Extra; }
    [StructLayout(LayoutKind.Sequential)] private struct Keyboard { public ushort Key,Scan;public uint Flags,Time;public nuint Extra; }
    [StructLayout(LayoutKind.Explicit)] private struct Union { [FieldOffset(0)] public Mouse Mouse;[FieldOffset(0)] public Keyboard Keyboard; }
    [StructLayout(LayoutKind.Sequential)] private struct Input { public uint Type;public Union Value; }
    [DllImport("user32.dll")] private static extern uint SendInput(uint count,Input[] inputs,int size);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll")] public static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool PostMessage(nint window,uint message,nuint wparam,nint lparam);
    [DllImport("user32.dll")] private static extern nint WindowFromPoint(Point point);
    [DllImport("user32.dll")] private static extern nint SendMessage(nint window,uint message,nuint wparam,nint lparam);
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] private static extern nint GetWindowLong(nint window,int index);
    public static string Style(nint window)=>((long)GetWindowLong(window,-16)).ToString("X");
    public static void Activate(Window window) { window.Activate();SetForegroundWindow(new WindowInteropHelper(window).Handle); }
    public static int HitTest(System.Windows.Point point)
    { var p=new Point{X=(int)point.X,Y=(int)point.Y};return (int)SendMessage(WindowFromPoint(p),0x84,0,(nint)((p.Y<<16)|(p.X&0xffff))); }
    private static void MouseEvent(uint flags) { var input=new Input{Type=0,Value=new Union{Mouse=new Mouse{Flags=flags}}};if(SendInput(1,[input],Marshal.SizeOf<Input>())!=1)throw new InvalidOperationException("Native mouse input failed"); }
    public static async Task Click(System.Windows.Point point,bool twice=false)
    { await Task.Run(()=>{if(twice)Thread.Sleep(600);SetCursorPos((int)point.X,(int)point.Y);MouseEvent(2);Thread.Sleep(35);MouseEvent(4);if(twice){Thread.Sleep(75);MouseEvent(2);Thread.Sleep(35);MouseEvent(4);}});await Task.Delay(250); }
    public static async Task Drag(System.Windows.Point from,int dx,int dy)
    { SetCursorPos((int)from.X,(int)from.Y);MouseEvent(2);await Task.Delay(100);for(var i=1;i<=8;i++){SetCursorPos((int)from.X+dx*i/8,(int)from.Y+dy*i/8);await Task.Delay(25);}MouseEvent(4);await Task.Delay(200); }
    public static Task AltF4() => Task.Run(() =>
    {
        var keys=new[]{new Keyboard{Key=0x12},new Keyboard{Key=0x73},new Keyboard{Key=0x73,Flags=2},new Keyboard{Key=0x12,Flags=2}};
        var inputs=keys.Select(key=>new Input{Type=1,Value=new Union{Keyboard=key}}).ToArray();
        foreach(var input in inputs){if(SendInput(1,[input],Marshal.SizeOf<Input>())!=1)throw new InvalidOperationException("Native keyboard input failed");Thread.Sleep(40);}
    });
}
