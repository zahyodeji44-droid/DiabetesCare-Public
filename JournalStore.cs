using System.Text.Json;

// All mutations are serialized and committed to disk before replacing in-memory state.
public sealed class JournalStore
{
    private readonly object gate = new();
    private readonly string path;
    private readonly JsonSerializerOptions json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private CareData data;
    public JournalStore(string path)
    {
        this.path = path;
        var legacyJson = new JsonSerializerOptions(json) { PropertyNameCaseInsensitive = true };
        data = File.Exists(path)
            ? JsonSerializer.Deserialize<CareData>(File.ReadAllText(path), legacyJson)
                ?? throw new InvalidDataException("Saved data is empty; restore your backup before restarting.")
            : new CareData();
        if (data.Records is null || data.Preferences is null || data.GlucoseReadings is null || data.Entries is null)
            throw new InvalidDataException("Saved data is incomplete. It has not been overwritten.");
        if (data.Version is < 0 or > 1)
            throw new InvalidDataException("This journal uses an unsupported version. It has not been overwritten.");
        if (data.Version == 0)
        {
            foreach (var r in data.GlucoseReadings)
                data.Records.Add(new JournalRecord { Kind = "glucose", Value = r.Value, Time = new DateTimeOffset(r.Time), Note = r.Note });
            foreach (var e in data.Entries)
                data.Records.Add(new JournalRecord { Kind = e.Category.ToLowerInvariant(), Title = e.Description, Time = new DateTimeOffset(e.Time) });
            data.Version = 1;
        }
    }
    private CareData Clone(CareData source) => JsonSerializer.Deserialize<CareData>(JsonSerializer.Serialize(source, json), json)!;
    public CareData Read() { lock (gate) return Clone(data); }
    public T Change<T>(Func<CareData, T> action)
    {
        lock (gate)
        {
            var next = Clone(data);
            var result = action(next);
            string serialized = JsonSerializer.Serialize(next, json);
            if (serialized == JsonSerializer.Serialize(data, json)) return result;
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            string temp = path + ".tmp";
            File.WriteAllText(temp, serialized);
            if (File.Exists(path)) File.Copy(path, path + ".bak", true);
            File.Move(temp, path, true);
            data = next;
            return result;
        }
    }
}
