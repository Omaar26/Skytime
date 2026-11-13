using System.Text.Json;
using Skytime.Models;

namespace Skytime.Services;

public sealed class CatalogService
{
    private readonly CatalogDocument _catalog;

    public CatalogService()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "data", "catalog.json");
        if (!File.Exists(path))
        {
            throw new FileNotFoundException("The catalog file was not found.", path);
        }

        var json = File.ReadAllText(path);
        _catalog = JsonSerializer.Deserialize<CatalogDocument>(
                       json,
                       new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                   ?? throw new InvalidDataException("The catalog file is empty or invalid.");
    }

    public IReadOnlyList<CatalogTarget> GetTargets() => _catalog.Targets;

    public CatalogTarget? GetTarget(string id) =>
        _catalog.Targets.FirstOrDefault(target =>
            string.Equals(target.Id, id, StringComparison.OrdinalIgnoreCase));

    public string? GetImageForObservation(string observationId) =>
        _catalog.Targets
            .SelectMany(target => target.Observations)
            .FirstOrDefault(observation =>
                string.Equals(observation.ObservationId, observationId, StringComparison.OrdinalIgnoreCase))
            ?.Image;
}
