# Architecture and design

## Request flow

The browser loads static assets from `wwwroot` and fetches `/api/state`. The API returns active journal records and preferences. Rendering is handled in plain JavaScript; user-provided text is escaped before entering generated HTML.

A submitted form becomes a `JournalRecord`. Glucose values are converted to canonical mmol/L before being sent to the API. ASP.NET validates types, dates, required descriptions, field lengths, numeric bounds, and supported record categories. It applies changes through `JournalStore`, and returns success only after persistence completes.

## Visit preparation

`VisitPlan` stores focus, observations, questions, and an optional appointment date alongside the journal. `PUT /api/visit` validates text lengths and the date before committing. Exports include the saved plan. `wwwroot/visit.js` creates a descriptive brief from the selected calendar-day window and the current agenda fields. Unsaved fields remain visibly marked; downloading or printing uses that current preview. Demo plans live only in the demo state.

Question prompts are fixed conversation starters selected using simple record counts. No diagnoses, causal claims, dosing instructions, or generated medical advice are produced. The homepage's device-like previews are explicitly illustrative.

## Persistence

A process-local lock protects all mutations. Each mutation clones the full data model, applies the operation, writes the new JSON to a temporary sibling file, backs up the old file, and replaces it. The in-memory state is replaced only after the disk operation succeeds. This is suitable for one local user; it is not a multi-process database. Do not run multiple servers against the same journal.

Legacy `GlucoseReadings` and `Entries` are retained in the model and migrated once using the schema version. Records use GUID identities and timestamp offsets. Deletion is soft deletion; restoration is an explicit endpoint.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/state` | Active records, deleted records, and preferences |
| POST | `/api/records` | Create a validated entry |
| PUT | `/api/records/{id}` | Edit an active entry |
| DELETE | `/api/records/{id}` | Soft-delete an entry |
| POST | `/api/records/{id}/restore` | Restore a deleted entry |
| PUT | `/api/preferences` | Save units, name, and optional range |
| GET | `/api/export` | JSON export of active records |
| GET | `/api/export.csv` | Spreadsheet-safe CSV export |

## Local request boundaries

The server binds to loopback, accepts only localhost/127.0.0.1 hosts, and requires a custom header for mutation requests. Browser-origin mutation requests must come from the same origin. Static assets use a self-only Content Security Policy; no external scripts, fonts, analytics, or CDNs are loaded. API responses are marked no-store. CSV text starting with spreadsheet formula markers is prefixed with an apostrophe.

These safeguards do not supply authentication or encryption. Anyone with access to the local machine can read the stored JSON. A hosted clinical version would require an identity system, protected storage, authorization, audit logs, retention policies, clinical review, and a database.

## Frontend

The navigation switches between overview, record management, descriptive insights, and preferences. SVG renders the glucose series without a dependency. Filters use local dates; averages use selected records. Demo data is separate browser-memory state and never posted to the real journal API.

## Practical limitations

- One user and one server process; no synchronization.
- JSON is appropriate for a small personal journal, not very large datasets.
- No scheduled notifications, import wizard, or automatic device readings.
- Export all CSV exports all active records; Export shown CSV uses the current filters and status. JSON is a backup/download, not an import feature.
- Medication dose is free text describing what was taken; the app never calculates a dose.
- UI provides undo for the last deletion during the current session and a Deleted records view for restoring any retained deletion, including after restarting.
- There are no preset clinical targets or medical alerts.
