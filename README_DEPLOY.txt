VERA Projects PWA — field/project build
Build date: 1 November 2026
Engine base: current VERA production build 2026-09-08-transparent-twigs

PURPOSE
This is a separate project-enabled VERA build. The VERA assessment engine and current tree-biography CSV row logic are retained; the added layer provides project persistence, stable UUIDs, autosaved drafts, project-scoped CSV/JSON and GIS/Mergin/Bud&Leaf Teams linking.

PROJECT DATA
- IndexedDB database: VERA_Projects_v2
- Stores: projects, assessments, photos, meta
- Project UUID, tree UUID and assessment UUID are permanent join identifiers.
- Normal form autosave writes only the active assessment record.
- Photos are stored separately from the assessment record so ordinary form autosave does not rewrite image data.
- JSON project backup is the restorable archive. CSV is the interoperable GIS/schedule export.
- Existing public VERA saved-tree records are copied once into an "Imported VERA assessments" project when visible on the same origin. Original public VERA storage is not deleted.

LINK PARAMETERS
Example:
?project_uuid=<uuid>&project_name=<name>&tree_uuid=<uuid>&tree_ref=T184&source=mergin
Optional: assessment_uuid=<uuid>
The same interface can use source=budleaf-teams or another caller. Incoming tree_ref updates the visible reference while tree_uuid remains the stable join key.

PWA CACHE
The service worker uses the vproj- cache prefix. It does not delete public VERA vera- caches, and public VERA's vera- cleanup does not match vproj-.

DEPLOYMENT
Upload every file in this folder together to the root of a NEW repository/site. Do not replace the existing public VERA repository with this build.
