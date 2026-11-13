using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Skytime.Services;

namespace Skytime.Controllers;

[ApiController]
[Route("images")]
public sealed class ImagesController : ControllerBase
{
    private readonly CatalogService _catalog;
    private readonly string _imagesRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "images"));
    private readonly FileExtensionContentTypeProvider _contentTypes = new();

    public ImagesController(CatalogService catalog) => _catalog = catalog;

    [HttpGet("{targetId}/{filename}")]
    public IActionResult GetImage(string targetId, string filename)
    {
        return ServeImage(Path.Combine(targetId, filename));
    }

    private IActionResult ServeImage(string relativePath)
    {
        var fullPath = Path.GetFullPath(Path.Combine(_imagesRoot, relativePath));
        var rootWithSeparator = _imagesRoot + Path.DirectorySeparatorChar;
        if (!fullPath.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase) || !System.IO.File.Exists(fullPath))
        {
            return NotFound(new { error = new { code = "FRAME_NOT_FOUND", message = "Image not found." } });
        }

        if (!_contentTypes.TryGetContentType(fullPath, out var contentType))
            contentType = "application/octet-stream";
        return PhysicalFile(fullPath, contentType);
    }
}
