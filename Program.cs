using Skytime.Services;

var builder = WebApplication.CreateBuilder(args);

// Keep the contract's default port, while allowing isolated test runs to override it.
builder.WebHost.UseUrls(builder.Configuration["urls"] ?? "http://localhost:5000");

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
