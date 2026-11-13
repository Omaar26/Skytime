namespace Skytime.Models;

public record Frame(
    string Id,
    double Mjd,
    string Date,
    int Detector,
    double WavelengthMin,
    double WavelengthMax,
    int Width,
    int Height,
    List<string> Flags,
    string ImageUrl);

public record FramesResponse(
    double Ra,
    double Dec,
    double Fov,
    int Count,
    List<Frame> Frames);

public record Target(string Name, double Ra, double Dec, double Fov);

// Error shape: { "error": { "code": "...", "message": "..." } }
public record ErrorBody(string Code, string Message);
public record ApiError(ErrorBody Error);
