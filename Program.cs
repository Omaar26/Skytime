using Skytime.Services;

var builder = WebApplication.CreateBuilder(args);

// Keep the contract's default port locally, while letting Azure App Service
// (ASPNETCORE_URLS / WEBSITES_PORT / PORT) or isolated test runs (--urls) override it.
var configuredUrls = builder.Configuration["urls"]
    ?? Environment.GetEnvironmentVariable("ASPNETCORE_URLS")
    ?? (Environment.GetEnvironmentVariable("WEBSITES_PORT") is { Length: > 0 } wp ? $"http://0.0.0.0:{wp}" : null)
    ?? (Environment.GetEnvironmentVariable("PORT") is { Length: > 0 } p ? $"http://0.0.0.0:{p}" : null)
    ?? "http://localhost:5012";
builder.WebHost.UseUrls(configuredUrls);

builder.Services
    .AddControllers()
    // Lets us return OUR error format for bad input
    .ConfigureApiBehaviorOptions(o => o.SuppressModelStateInvalidFilter = true);

// CORS: lets the frontend (another port) call this API
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddOpenApi();
builder.Services.AddSingleton<CatalogService>();
builder.Services.AddSingleton<SampleTargetService>();
builder.Services.AddHttpClient<ImageServiceClient>(client =>
{
    var baseUrl = builder.Configuration["ImageService:BaseUrl"] ?? "http://localhost:8000";
    client.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(190);
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// app.UseHttpsRedirection();   // disabled on purpose (we only use plain http)

app.UseCors();
app.UseMiddleware<ApiErrorMiddleware>();
app.UseAuthorization();
app.MapControllers();

app.Run();
