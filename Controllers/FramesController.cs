using Microsoft.AspNetCore.Mvc;
using System.Net;
using System.Text.Json;
using Skytime.Models;
using Skytime.Services;

namespace Skytime.Controllers;

[ApiController]
[Route("api/[controller]")]
public class FramesController : ControllerBase
{
    private const int MockFrameCount = 8;
    private const int ImageSize = 200;
    private readonly CatalogService _catalog;
    private readonly SampleTargetService _targets;
    private readonly ImageServiceClient _imageService;
    private readonly bool _useSpherex;

    public FramesController(
        CatalogService catalog,
        SampleTargetService targets,
        ImageServiceClient imageService,
        IConfiguration configuration)
    {
        _catalog = catalog;
        _targets = targets;
        _imageService = imageService;
        _useSpherex = string.Equals(configuration["DataMode"], "spherex", StringComparison.OrdinalIgnoreCase);
    }

    // A1: GET /api/frames?ra=..&dec=..&fov=..
    [HttpGet]
    public async Task<IActionResult> Get(double? ra, double? dec, double? fov, CancellationToken cancellationToken)
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

        if (_useSpherex)
            return await GetSpherexFrames(ra.Value, dec.Value, fovValue, cancellationToken);

        var selectedTarget = _targets.FindByCoordinates(ra.Value, dec.Value);
        var targetId = selectedTarget?.Id ?? "custom";
        var frames = Enumerable.Range(0, MockFrameCount).Select(i =>
        {
            double mjd = 60800 + i * 10;
            return new Frame(
                Id: $"mock-{targetId}-{i}",
                Mjd: mjd,
                Date: MjdToDate(mjd),
                Detector: (i % 6) + 1,
                WavelengthMin: 0.75,
                WavelengthMax: 1.1,
                Width: ImageSize,
                Height: ImageSize,
                Flags: new List<string> { "simulated" },
                ImageUrl: $"/api/frames/mock-{targetId}-{i}/image");
        }).ToList();

        return Ok(new FramesResponse(ra.Value, dec.Value, fovValue, frames.Count, frames));
    }

    // A2: GET /api/frames/{id}/image
    [HttpGet("{id}/image")]
    public async Task<IActionResult> GetImage(string id, CancellationToken cancellationToken)
    {
        var catalogImage = _catalog.GetImageForObservation(id);
        if (!string.IsNullOrWhiteSpace(catalogImage) && catalogImage.StartsWith("/images/", StringComparison.Ordinal))
        {
            var imageRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "images"));
            var relativePath = catalogImage["/images/".Length..].Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.GetFullPath(Path.Combine(imageRoot, relativePath));
            if (fullPath.StartsWith(imageRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) &&
                System.IO.File.Exists(fullPath))
                return PhysicalFile(fullPath, "image/png");
        }

        if (id.StartsWith("spherex-", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                using var imageResponse = await _imageService.GetImageAsync(id, cancellationToken);
                if (imageResponse.StatusCode == HttpStatusCode.NotFound)
                    return Fail(404, "FRAME_NOT_FOUND", $"No frame with id '{id}'.");
                if (imageResponse.StatusCode == HttpStatusCode.GatewayTimeout || imageResponse.StatusCode == HttpStatusCode.RequestTimeout)
                    return Fail(504, "IMAGE_SERVICE_TIMEOUT", "The SPHEREx image service took too long to respond.");
                if (!imageResponse.IsSuccessStatusCode)
                    return Fail(502, "IMAGE_SERVICE_ERROR", "The SPHEREx image service could not return this image.");
                var imageBytes = await imageResponse.Content.ReadAsByteArrayAsync(cancellationToken);
                return File(imageBytes, "image/png");
            }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return Fail(504, "IMAGE_SERVICE_TIMEOUT", "The SPHEREx image service took too long to respond.");
            }
            catch (HttpRequestException)
            {
                return Fail(502, "IMAGE_SERVICE_ERROR", "The SPHEREx image service is unavailable.");
            }
        }

        if (!TryGetMockFrame(id, out var targetId, out int i) ||
            (targetId != "custom" && _targets.FindById(targetId) is null))
        {
            return Fail(404, "FRAME_NOT_FOUND", $"No frame with id '{id}'.");
        }

        int x = 20 + i * 22; // the moving object
        var target = targetId == "custom" ? null : _targets.FindById(targetId);
        var label = System.Security.SecurityElement.Escape(target?.Name ?? "Custom coordinates") ?? "Custom coordinates";

        var svg = $"""
            <svg xmlns="http://www.w3.org/2000/svg" width="{ImageSize}" height="{ImageSize}">
              <rect width="{ImageSize}" height="{ImageSize}" fill="black"/>
              <circle cx="150" cy="150" r="5" fill="gray"/>
              <circle cx="{x}" cy="100" r="6" fill="white"/>
              <text x="10" y="18" fill="#7dd3fc" font-size="10">SIMULATED</text>
              <text x="10" y="190" fill="gray" font-size="11">{label} · frame {i + 1}</text>
            </svg>
            """;

        return Content(svg, "image/svg+xml");
    }

    // Helpers
    private IActionResult Fail(int status, string code, string message) =>
        StatusCode(status, new ApiError(new ErrorBody(code, message)));

    private async Task<IActionResult> GetSpherexFrames(double ra, double dec, double fov, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _imageService.GetCutoutAsync(ra, dec, fov, cancellationToken);
            if (response.StatusCode == HttpStatusCode.NotFound)
                return Ok(new FramesResponse(ra, dec, fov, 0, []));
            if (response.StatusCode == HttpStatusCode.GatewayTimeout || response.StatusCode == HttpStatusCode.RequestTimeout)
                return Fail(504, "IMAGE_SERVICE_TIMEOUT", "The SPHEREx image service took too long to respond.");
            if (!response.IsSuccessStatusCode)
                return Fail(502, "IMAGE_SERVICE_ERROR", "The SPHEREx image service could not search the archive.");

            var serviceResult = await JsonSerializer.DeserializeAsync<ImageServiceFramesResponse>(
                await response.Content.ReadAsStreamAsync(cancellationToken),
                new JsonSerializerOptions(JsonSerializerDefaults.Web),
                cancellationToken);
            if (serviceResult is null)
                return Fail(502, "IMAGE_SERVICE_ERROR", "The SPHEREx image service returned an invalid response.");

            var frames = serviceResult.Frames.Select(frame => new Frame(
                frame.Id,
                frame.Mjd,
                frame.Date,
                frame.Detector,
                frame.WavelengthMin,
                frame.WavelengthMax,
                frame.Width,
                frame.Height,
                frame.Flags,
                $"/api/frames/{frame.Id}/image")).ToList();
            return Ok(new FramesResponse(ra, dec, fov, frames.Count, frames));
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return Fail(504, "IMAGE_SERVICE_TIMEOUT", "The SPHEREx image service took too long to respond.");
        }
        catch (HttpRequestException)
        {
            return Fail(502, "IMAGE_SERVICE_ERROR", "The SPHEREx image service is unavailable.");
        }
        catch (JsonException)
        {
            return Fail(502, "IMAGE_SERVICE_ERROR", "The SPHEREx image service returned invalid JSON.");
        }
    }

    private static bool TryGetMockFrame(string id, out string targetId, out int index)
    {
        targetId = "custom";
        index = -1;

        // Keep the original mock0..mock7 addresses usable for existing clients.
        if (id.StartsWith("mock", StringComparison.OrdinalIgnoreCase) &&
            int.TryParse(id.AsSpan(4), out index) && index is >= 0 and < MockFrameCount)
            return true;

        if (!id.StartsWith("mock-", StringComparison.OrdinalIgnoreCase))
            return false;

        var lastDash = id.LastIndexOf('-');
        if (lastDash <= 5 || !int.TryParse(id.AsSpan(lastDash + 1), out index) || index is < 0 or >= MockFrameCount)
            return false;

        targetId = id[5..lastDash];
        return targetId == "custom" || targetId.Length > 0;
    }

    private static string MjdToDate(double mjd) =>
        new DateTime(1858, 11, 17).AddDays(mjd).ToString("yyyy-MM-dd");
} 

