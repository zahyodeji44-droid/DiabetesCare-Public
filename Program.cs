using System.Globalization;
using System.Text;

var builder = WebApplication.CreateBuilder(args);
int port = int.TryParse(builder.Configuration["port"] ?? "5188", out var configuredPort)
    && configuredPort is > 1023 and <= 65535 ? configuredPort
    : throw new ArgumentException("Port must be between 1024 and 65535.");
builder.WebHost.UseUrls($"http://127.0.0.1:{port}");
string dataDirectory = builder.Configuration["data-dir"] ?? Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DiabetesCare");
var store = new JournalStore(Path.Combine(dataDirectory, "care-data.json"));
builder.Services.AddSingleton(store);
var app = builder.Build();

app.Use(async (ctx, next) =>
{
    // This single-user app is intentionally accessible only through loopback.
    if (ctx.Request.Host.Host is not ("localhost" or "127.0.0.1"))
    { ctx.Response.StatusCode = 400; return; }
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
    ctx.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
    if (ctx.Request.Path.StartsWithSegments("/api")) ctx.Response.Headers.CacheControl = "no-store";
    if (ctx.Request.Method is not ("GET" or "HEAD"))
    {
        string origin = ctx.Request.Headers.Origin.ToString();
        if (!ctx.Request.Headers.ContainsKey("X-DiabetesCare") ||
            (origin.Length > 0 && origin != $"{ctx.Request.Scheme}://{ctx.Request.Host}"))
        { ctx.Response.StatusCode = 403; return; }
    }
    try { await next(); }
    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
    {
        app.Logger.LogError(ex, "Unable to save journal");
        if (!ctx.Response.HasStarted)
        { ctx.Response.StatusCode = 503; await ctx.Response.WriteAsJsonAsync(new { error = "Could not save to disk. Your previous data is safe. Please try again." }); }
    }
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapGet("/api/state", () =>
{
    var data = store.Read();
    return Results.Ok(new { records = data.Records.Where(r => !r.Deleted), deletedRecords = data.Records.Where(r => r.Deleted), preferences = data.Preferences, visit = data.Visit });
});
app.MapPost("/api/records", (JournalRecord record) =>
{
    var error = Validate(record);
    if (error != null) return Results.BadRequest(new { error });
    record.Id = Guid.NewGuid(); record.Deleted = false;
    store.Change(d => { d.Records.Add(record); return true; });
    return Results.Created($"/api/records/{record.Id}", record);
});
app.MapPut("/api/records/{id:guid}", (Guid id, JournalRecord record) =>
{
    var error = Validate(record);
    if (error != null) return Results.BadRequest(new { error });
    bool found = store.Change(d =>
    {
        int index = d.Records.FindIndex(r => r.Id == id && !r.Deleted);
        if (index < 0) return false;
        record.Id = id; record.Deleted = false; d.Records[index] = record; return true;
    });
    return found ? Results.Ok(record) : Results.NotFound();
});
app.MapDelete("/api/records/{id:guid}", (Guid id) =>
{
    bool found = store.Change(d =>
    {
        var record = d.Records.Find(r => r.Id == id && !r.Deleted);
        if (record is null) return false;
        record.Deleted = true; return true;
    });
    return found ? Results.NoContent() : Results.NotFound();
});
app.MapPost("/api/records/{id:guid}/restore", (Guid id) =>
{
    var record = store.Change(d =>
    {
        var item = d.Records.Find(r => r.Id == id && r.Deleted);
        if (item != null) item.Deleted = false;
        return item;
    });
    return record is null ? Results.NotFound() : Results.Ok(record);
});
app.MapPut("/api/preferences", (Preferences prefs) =>
{
    if (prefs.Name is null || prefs.Name.Length > 80 || prefs.Unit is not ("mmol/L" or "mg/dL")
        || prefs.Lower.HasValue != prefs.Upper.HasValue
        || (prefs.Lower.HasValue && (!double.IsFinite(prefs.Lower.Value) || !double.IsFinite(prefs.Upper!.Value)
            || prefs.Lower <= 0 || prefs.Upper <= prefs.Lower || prefs.Upper > 100)))
        return Results.BadRequest(new { error = "Enter a name up to 80 characters and a valid personal range, or leave both limits blank." });
    store.Change(d => { d.Preferences = prefs; return true; });
    return Results.Ok(prefs);
});
app.MapPut("/api/visit", (VisitPlan visit) =>
{
    if (visit.Focus is null || visit.Observations is null || visit.Questions is null || visit.AppointmentDate is null
        || visit.Focus.Length > 160 || visit.Observations.Length > 2000 || visit.Questions.Length > 2000
        || (visit.AppointmentDate.Length > 0 && !DateOnly.TryParseExact(visit.AppointmentDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)))
        return Results.BadRequest(new { error = "Use a focus up to 160 characters, notes up to 2000 characters, and a valid appointment date." });
    store.Change(d => { d.Visit = visit; return true; });
    return Results.Ok(visit);
});
app.MapGet("/api/export", () =>
{
    var data = store.Read();
    return Results.Json(new { exportedAt = DateTimeOffset.Now, version = 1, preferences = data.Preferences, visit = data.Visit, records = data.Records.Where(r => !r.Deleted) });
});
app.MapGet("/api/export.csv", () =>
{
    var csv = new StringBuilder("Type,Timestamp,Glucose (mmol/L),Title,Context,Notes,Carbohydrates (g),Duration (min),Dose\r\n");
    foreach (var r in store.Read().Records.Where(r => !r.Deleted).OrderBy(r => r.Time))
        csv.AppendLine(string.Join(",", new[] { r.Kind, r.Time.ToString("O"), r.Value?.ToString(CultureInfo.InvariantCulture) ?? "", r.Title, r.Context, r.Note, r.Carbs?.ToString(CultureInfo.InvariantCulture) ?? "", r.Duration?.ToString(CultureInfo.InvariantCulture) ?? "", r.Dose }.Select(Csv)));
    return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv", "diabetescare-records.csv");
});
app.Run();

static string Csv(string value)
{
    // Prevent formula execution when a text field is opened in a spreadsheet.
    if (value.TrimStart().StartsWith('=') || value.TrimStart().StartsWith('+') || value.TrimStart().StartsWith('-') || value.TrimStart().StartsWith('@')) value = "'" + value;
    return "\"" + value.Replace("\"", "\"\"") + "\"";
}
static string? Validate(JournalRecord r)
{
    if (r.Kind is not ("glucose" or "meal" or "medication" or "activity" or "symptom")) return "Choose a supported record type.";
    if (r.Title is null || r.Note is null || r.Context is null || r.Dose is null || r.Title.Length > 160 || r.Note.Length > 2000 || r.Context.Length > 80 || r.Dose.Length > 80) return "One or more text fields are too long.";
    if (r.Time.Year < 2000 || r.Time > DateTimeOffset.UtcNow.AddMinutes(5)) return "Choose a date from 2000 through the present.";
    if (r.Kind == "glucose" && (r.Value is null || !double.IsFinite(r.Value.Value) || r.Value <= 0 || r.Value > 100)) return "Enter a glucose value greater than 0 and at most 100 mmol/L (1800 mg/dL).";
    if (r.Kind != "glucose" && string.IsNullOrWhiteSpace(r.Title)) return "Enter a description for this record.";
    if (r.Carbs is double carbs && (!double.IsFinite(carbs) || carbs < 0 || carbs > 1000)) return "Carbohydrates must be between 0 and 1000 g.";
    if (r.Duration is double duration && (!double.IsFinite(duration) || duration <= 0 || duration > 1440)) return "Duration must be greater than 0 and at most 1440 minutes.";
    return null;
}
