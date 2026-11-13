namespace Skytime.Models;

public sealed class CatalogDocument
{
    public bool SampleData { get; set; }
    public string Notice { get; set; } = string.Empty;
    public List<CatalogTarget> Targets { get; set; } = [];
}

public sealed class CatalogTarget
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public List<CatalogObservation> Observations { get; set; } = [];
}

public sealed class CatalogObservation
{
    public string Date { get; set; } = string.Empty;
    public string ObservationId { get; set; } = string.Empty;
    public string Release { get; set; } = string.Empty;
    public string Detector { get; set; } = string.Empty;
    public string Image { get; set; } = string.Empty;
    public string FitsSource { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string SourceUrl { get; set; } = string.Empty;
}