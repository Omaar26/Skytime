using Microsoft.AspNetCore.Mvc;
using Skytime.Models;
using Skytime.Services;

namespace Skytime.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TargetsController : ControllerBase
{
    private readonly SampleTargetService _targets;

    public TargetsController(SampleTargetService targets) => _targets = targets;

    // A3: GET /api/targets
    [HttpGet]
    public ActionResult<List<Target>> Get() => _targets.GetTargets()
        .Select(target => new Target(target.Name, target.Ra, target.Dec, target.Fov))
        .ToList();
}
