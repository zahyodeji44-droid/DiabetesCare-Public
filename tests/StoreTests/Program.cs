using System.Text.Json;
var root = Path.Combine(AppContext.BaseDirectory, "test-data");
Directory.CreateDirectory(root);
var path = Path.Combine(root, "journal.json");
File.WriteAllText(path, """{"GlucoseReadings":[{"Value":6.4,"Time":"2026-10-01T12:00:00","Note":"Legacy note"}],"Entries":[{"Category":"Meal","Description":"Lunch","Time":"2026-10-01T12:30:00"}]}""");
var store = new JournalStore(path);
Check(store.Read().Records.Count == 2, "Legacy migration");
Check(store.Read().Records[0].Note == "Legacy note", "Legacy note preservation");
Parallel.For(0, 20, i => store.Change(d => { d.Records.Add(new JournalRecord { Kind = "symptom", Title = i.ToString() }); return true; }));
Check(store.Read().Records.Count == 22, "Concurrent mutations");
Check(new JournalStore(path).Read().Records.Count == 22, "Restart persistence without duplicate migration");
Check(File.Exists(path + ".bak"), "Previous-save backup");
var clone = store.Read();clone.Records.Clear();Check(store.Read().Records.Count==22,"Read snapshot isolation");
var bad = Path.Combine(root,"corrupt.json");File.WriteAllText(bad,"{broken");
try { new JournalStore(bad); throw new Exception("Corrupt journal accepted"); } catch(JsonException) { }
Check(File.ReadAllText(bad)=="{broken","Corrupt-file preservation");
var blocked=Path.Combine(root,"blocked");File.WriteAllText(blocked,"a file, not a directory");
var unavailable = new JournalStore(Path.Combine(blocked,"data.json"));
try { unavailable.Change(d=>{d.Records.Add(new JournalRecord());return true;});throw new Exception("Disk failure ignored"); } catch(IOException) { }
Check(unavailable.Read().Records.Count==0,"Disk failure leaves memory unchanged");
var future = Path.Combine(root,"future.json");File.WriteAllText(future,"{\"version\":99}");
try { new JournalStore(future);throw new Exception("Unsupported version accepted"); }catch(InvalidDataException) { }
Check(File.ReadAllText(future)=="{\"version\":99}","Unsupported schema preserved");
var previousBackup=File.ReadAllText(path+".bak");
store.Change(d => false);
Check(File.ReadAllText(path+".bak")==previousBackup,"No-op does not rotate backup");
var recordId=store.Read().Records[0].Id;
store.Change(d => {d.Records.First(r=>r.Id==recordId).Deleted=true;return true;});
var restarted=new JournalStore(path);
Check(restarted.Read().Records.First(r=>r.Id==recordId).Deleted,"Deleted state survives restart");
restarted.Change(d=>{d.Records.First(r=>r.Id==recordId).Deleted=false;return true;});
Check(!new JournalStore(path).Read().Records.First(r=>r.Id==recordId).Deleted,"Restoration survives restart");
restarted.Change(d=>{d.Visit=new VisitPlan {Focus="Discuss my routine",Questions="What should I track?"};return true;});
Check(new JournalStore(path).Read().Visit.Focus=="Discuss my routine","Visit notes survive restart");
Console.WriteLine("PASS: legacy migration, note preservation, concurrent mutations, restart persistence, backups, snapshot isolation, corruption protection, disk-failure rollback, unsupported schema protection, no-op backups, durable deletion/restoration.");
void Check(bool passed,string name){if(!passed)throw new Exception(name);}
Directory.Delete(root,true);
