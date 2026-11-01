# VERA Projects PWA — prototype project build

This is a separate project-enabled build derived from the current VERA V1 Beta user interface and assessment engine. It is intended for testing in a fresh repository. It does not require changes to the existing VERA V1 Beta repository.

## What is added

- **New project** and **Open project** controls.
- Project identity using a permanent `project_uuid`.
- Assessment identity using `assessment_uuid` and `tree_uuid`.
- Project data stored in **IndexedDB**, with a localStorage fallback if IndexedDB is unavailable.
- Automatic migration of the old global `vera_v0_6_saved_trees` list into a **Legacy / Unassigned** project. The old key is deliberately left untouched as a safety copy.
- Debounced **autosave of draft form state**, including VAI/TreM selections, notes, multistem values and selected in-app photo data.
- Draft recovery when reopening a project or when VERA is reopened after app switching.
- Saved assessments remain editable through **Open** in the project assessment list.
- **Export current assessment** as a one-row CSV.
- **Export project CSV** containing only the active project's assessments.
- Full **project backup/restore** as `.vera.json`, including the saved editable form state and photos.
- **Backup all projects** from the project manager.
- Optional survey deep-link support for Mergin/QGIS.

## Mergin / QGIS launch parameters

The app recognises these query parameters:

- `project_uuid` — stable survey project UUID.
- `project_name` — human-readable project name.
- `tree_uuid` — stable tree/feature UUID.
- `tree_ref` — human-readable tree reference, e.g. `T184`.

Example shape (replace the host/path with the new GitHub Pages URL):

`https://<host>/<repo>/?project_uuid=<PROJECT_UUID>&project_name=A30%20DCO&tree_uuid=<TREE_UUID>&tree_ref=T184`

If the project UUID is new, VERA creates the local project automatically. If a matching draft already exists for the tree UUID, VERA reopens it.

## Upload to a fresh GitHub repository

Upload every file in this folder to the repository root, enable **Settings → Pages → Deploy from branch**, and select the root of `main`.

The service worker scope is relative, so the PWA works correctly from a GitHub Pages repository sub-path.

## Important test cases before field use

1. Create Project A and save two assessments.
2. Create Project B and confirm Project A trees do not appear.
3. Reopen Project A and confirm its assessments return.
4. Begin an assessment, enter data, leave/reload the app, then confirm the draft is restored.
5. Export Project A CSV and confirm all rows contain Project A's `project_uuid` and no Project B records.
6. Backup Project A, delete it locally, restore the `.vera.json`, and confirm the saved assessment can be opened.
7. Open the app with Mergin-style URL parameters and confirm project/tree UUID linkage is displayed and exported.
8. Test installed-PWA behaviour offline after one successful online load.

## Data safety note

IndexedDB is the working store, not a substitute for a durable external backup. Site data can still be cleared by the browser/OS. Use **Backup project** regularly for fieldwork and retain exported project backups outside browser storage.
