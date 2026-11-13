using Microsoft.AspNetCore.Mvc;
using Skytime.Services;

namespace Skytime.Controllers;

[ApiController]
[Route("api/catalog/targets")]
public sealed class CatalogController(CatalogService catalog) : ControllerBase
{
    [HttpGet]
    public IActionResult GetTargets() => Ok(catalog.GetTargets());

    [HttpGet("{id}/observations")]
    public IActionResult GetObservations(string id)
    {
        var target = catalog.GetTarget(id);
        if (target is null)
            return NotFound(new { error = new { code = "TARGET_NOT_FOUND", message = $"Target '{id}' was not found." } });
        return Ok(target.Observations);
    }
}
