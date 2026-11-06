public class CareData
{
    public int Version { get; set; }
    public List<GlucoseReading> GlucoseReadings { get; set; } = new();
    public List<CareEntry> Entries { get; set; } = new();
    public List<JournalRecord> Records { get; set; } = new();
    public Preferences Preferences { get; set; } = new();
    public VisitPlan Visit { get; set; } = new();
}
public class CareEntry
{
    public string Category { get; set; } = "";
    public string Description { get; set; } = "";
    public DateTime Time { get; set; }
}
public class JournalRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Kind { get; set; } = "glucose";
    public DateTimeOffset Time { get; set; } = DateTimeOffset.Now;
    public double? Value { get; set; }
    public string Title { get; set; } = "";
    public string Context { get; set; } = "";
    public string Note { get; set; } = "";
    public double? Carbs { get; set; }
    public double? Duration { get; set; }
    public string Dose { get; set; } = "";
    public bool Deleted { get; set; }
}
public class Preferences
{
    public string Name { get; set; } = "";
    public string Unit { get; set; } = "mmol/L";
    public double? Lower { get; set; }
    public double? Upper { get; set; }
}

public class VisitPlan
{
    public string Focus { get; set; } = "";
    public string Observations { get; set; } = "";
    public string Questions { get; set; } = "";
    public string AppointmentDate { get; set; } = "";
}
