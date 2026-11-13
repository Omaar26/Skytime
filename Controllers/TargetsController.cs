using Microsoft.AspNetCore.Mvc;
using Skytime.Models;

namespace Skytime.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TargetsController : ControllerBase
{
    // A3: GET /api/targets
    [HttpGet]
    public ActionResult<List<Target>> Get() => new List<Target>
    {
        new("WISE 0855",      133.7951,  -7.2452, 0.1),
        new("Barnard's Star", 269.452,    4.693,  0.1),
        new("Epsilon Indi",   330.840,  -56.786,  0.1),
        new("RW Aurigae",      76.957,   30.401,  0.1),
        new("R Draconis",     248.175,   66.755,  0.1),
    };
}
