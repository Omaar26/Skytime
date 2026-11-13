var builder = WebApplication.CreateBuilder(args);

// Fixed port from the contract
builder.WebHost.UseUrls("http://localhost:5000");

builder.Services
    .AddControllers()
    // Lets us return OUR error format for bad input
    .ConfigureApiBehaviorOptions(o => o.SuppressModelStateInvalidFilter = true);

// CORS: lets the frontend (another port) call this API
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// app.UseHttpsRedirection();   // disabled on purpose (we only use plain http)

app.UseCors();
app.UseAuthorization();
app.MapControllers();

app.Run();