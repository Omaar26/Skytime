using Microsoft.AspNetCore.Mvc;
using Skytime.Models;

namespace Skytime.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FramesController : ControllerBase
{
    private const int MockFrameCount = 8;
    private const int ImageSize = 200;

    // A1: GET /api/frames?ra=..&dec=..&fov=..
    [HttpGet]
    public IActionResult Get(double? ra, double? dec, double? fov)
    {
        if (ra is null || !(ra.Value >= 0 && ra.Value <= 360))
            return Fail(400, "INVALID_RA", "RA is required and must be a number between 0 and 360.");

        if (dec is null || !(dec.Value >= -90 && dec.Value <= 90))
            return Fail(400, "INVALID_DEC", "Dec is required and must be a number between -90 and 90.");

        // fov is optional (default 0.1), but if it was sent it must be valid
        bool fovSent = Request.Query.ContainsKey("fov");
        if (fovSent && fov is null)
            return Fail(400, "INVALID_FOV", "FOV must be a number between 0.01 and 0.5.");
        double fovValue = fov ?? 0.1;
        if (!(fovValue >= 0.01 && fovValue <= 0.5))
            return Fail(400, "INVALID_FOV", "FOV must be a number between 0.01 and 0.5.");

        // MOCK DATA (later: replace with a call to the Python image service)
        var frames = Enumerable.Range(0, MockFrameCount).Select(i =>
        {
            double mjd = 60800 + i * 10;
            return new Frame(
                Id: $"mock{i}",
                Mjd: mjd,
                Date: MjdToDate(mjd),
                Detector: (i % 6) + 1,
                WavelengthMin: 0.75,
                WavelengthMax: 1.1,
                Width: ImageSize,
                Height: ImageSize,
                Flags: new List<string>(),
                ImageUrl: $"/api/frames/mock{i}/image");
        }).ToList();

        return Ok(new FramesResponse(ra.Value, dec.Value, fovValue, frames.Count, frames));
    }

    // A2: GET /api/frames/{id}/image
    [HttpGet("{id}/image")]
    public IActionResult GetImage(string id)
    {
        if (!id.StartsWith("mock") ||
            !int.TryParse(id.Substring(4), out int i) ||
            i < 0 || i >= MockFrameCount)
        {
            return Fail(404, "FRAME_NOT_FOUND", $"No frame with id '{id}'.");
        }

        int x = 20 + i * 22; // the moving object

        var svg = $"""
            <svg xmlns="http://www.w3.org/2000/svg" width="{ImageSize}" height="{ImageSize}">
              <rect width="{ImageSize}" height="{ImageSize}" fill="black"/>
              <circle cx="150" cy="150" r="5" fill="gray"/>
              <circle cx="{x}" cy="100" r="6" fill="white"/>
              <text x="10" y="190" fill="gray" font-size="14">frame {i}</text>
            </svg>
            """;

        return Content(svg, "image/svg+xml");
    }

    // Helpers
    private IActionResult Fail(int status, string code, string message) =>
        StatusCode(status, new ApiError(new ErrorBody(code, message)));

    private static string MjdToDate(double mjd) =>
        new DateTime(1858, 11, 17).AddDays(mjd).ToString("yyyy-MM-dd");
} 

