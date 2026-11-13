namespace Skytime.Models;

public sealed record DemoTarget(
    string Id,
    string Name,
    double Ra,
    double Dec,
    double Fov,
    string ObjectType,
    string CoordinateSource);
