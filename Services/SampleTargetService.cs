using System.Text.Json;
using Skytime.Models;

namespace Skytime.Services;

public sealed class SampleTargetService
{
    private readonly List<DemoTarget> _targets;

    public SampleTargetService()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "data", "targets.json");
        if (!File.Exists(path))
            throw new FileNotFoundException("The sample targets file was not found.", path);

        _targets = JsonSerializer.Deserialize<List<DemoTarget>>(
                       File.ReadAllText(path),
                       new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                   ?? throw new InvalidDataException("The sample targets file is empty or invalid.");
    }

    public IReadOnlyList<DemoTarget> GetTargets() => _targets;

    public DemoTarget? FindByCoordinates(double ra, double dec)
    {
        // Match preset queries within roughly 36 arcseconds. The RA difference
        // is scaled by declination so the threshold describes angular distance.
        return _targets
            .Select(target => new
            {
                Target = target,
                Distance = Math.Sqrt(
                    Math.Pow((target.Ra - ra) * Math.Cos(dec * Math.PI / 180), 2) +
                    Math.Pow(target.Dec - dec, 2))
            })
            .Where(candidate => candidate.Distance <= 0.01)
            .OrderBy(candidate => candidate.Distance)
            .Select(candidate => candidate.Target)
            .FirstOrDefault();
    }

    public DemoTarget? FindById(string id) =>
        _targets.FirstOrDefault(target => string.Equals(target.Id, id, StringComparison.OrdinalIgnoreCase));
}
