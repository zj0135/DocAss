namespace DocAss.Host.Windowing;

/// <summary>
/// Abstraction for coordinating application close with pending persistence and frontend state.
/// </summary>
public interface ICloseCoordinator
{
    string State { get; }

    Task<bool> RequestAsync();

    void CancelClose();
}
