namespace DocAss.Host.Windowing;

public sealed class CloseCoordinator(Func<Task> drainAndSave)
{
    public string State { get; private set; } = "open";
    private Task<bool>? current;
    public Task<bool> RequestAsync() => current ??= RunAsync();
    private async Task<bool> RunAsync()
    {
        State = "closingRequested";
        try { State = "draining"; await drainAndSave(); State = "saved"; return true; }
        catch { State = "closeBlocked"; return false; }
    }
    public void CancelClose() { if (State == "closeBlocked") { State = "open"; current = null; } }
}
