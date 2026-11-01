# VERA Projects build — validation notes

Build date: 2026-11-01

## Automated checks completed

- Inline JavaScript syntax checked with Node.js: **pass**.
- Service worker JavaScript syntax checked with Node.js: **pass**.
- `manifest.webmanifest` JSON parse: **pass**.
- HTML parsed and checked for duplicate element IDs: **pass**.
- Browser DOM smoke test with network requests blocked: **pass**.
- New project creation: **pass**.
- Project switching and isolation (Scheme One assessment does not appear in Scheme Two): **pass**.
- Draft autosave and recovery after a simulated restart: **pass**.
- Run VERA assessment, save assessment, reopen saved assessment with form data restored: **pass**.
- Project backup download: valid `VERA_PROJECT_BACKUP` JSON containing one completed assessment and editable form state: **pass**.
- Project CSV export: includes `project_uuid`, `project_name`, `tree_uuid`, `assessment_uuid` and `report_text`: **pass**.
- Legacy `vera_v0_6_saved_trees` migration to `Legacy / Unassigned`: **pass**; the old key is intentionally retained as a safety copy.

## Deployment checks still required after upload

These require the app to be served from its real HTTPS GitHub Pages URL:

- Install as a PWA on Android.
- Confirm service-worker/offline behaviour after an online first load.
- Confirm Android resumes the autosaved draft after switching between Mergin Maps and VERA.
- Confirm a Mergin/QGIS URL action opens the installed/browser VERA route with `project_uuid`, `project_name`, `tree_uuid` and `tree_ref` query parameters.
- Confirm backup/restore with real Android file picking.

The existing VERA assessment engine was not intentionally modified; this build adds the project/persistence layer around it.
