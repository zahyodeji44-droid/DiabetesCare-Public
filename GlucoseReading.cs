// Legacy console records are retained during migration to the visual app.
public class GlucoseReading
{
    public double Value { get; set; }
    public DateTime Time { get; set; }
    public string Note { get; set; } = "";
}
