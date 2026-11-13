using System.Text.Json;

namespace Skytime.Services;

public sealed class ApiErrorMiddleware(RequestDelegate next, ILogger<ApiErrorMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Unhandled request error");
            if (!context.Response.HasStarted)
                await WriteError(context, 500, "INTERNAL_ERROR", "An unexpected server error occurred.");
        }
    }

    private static async Task WriteError(HttpContext context, int status, string code, string message)
    {
        context.Response.Clear();
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = new { code, message } }));
    }
}
