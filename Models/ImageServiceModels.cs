namespace Skytime.Models;

public sealed record ImageServiceFramesResponse(
    double Ra,
    double Dec,
    double Fov,
    int Count,
    List<ImageServiceFrame> Frames);

public sealed record ImageServiceFrame(
    string Id,
    double Mjd,
    string Date,
    int Detector,
    double WavelengthMin,
    double WavelengthMax,
    int Width,
    int Height,
    List<string> Flags);
