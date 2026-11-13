using System.Globalization;

namespace Skytime.Services;

public sealed class ImageServiceClient(HttpClient client)
{
    public Task<HttpResponseMessage> GetCutoutAsync(
        double ra,
        double dec,
        double fov,
        CancellationToken cancellationToken) =>
        client.GetAsync(
            $"cutout?ra={ra.ToString("R", CultureInfo.InvariantCulture)}&dec={dec.ToString("R", CultureInfo.InvariantCulture)}&size={fov.ToString("R", CultureInfo.InvariantCulture)}",
            cancellationToken);

    public Task<HttpResponseMessage> GetImageAsync(string id, CancellationToken cancellationToken) =>
        client.GetAsync($"image/{Uri.EscapeDataString(id)}", cancellationToken);
}
