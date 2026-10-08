---
'@fission-ai/openspec': patch
---

Preserve customized skills and commands during `openspec update` instead of overwriting them. An artifact whose frontmatter `metadata:` block carries keys the generators never emit (e.g. `backend: falkordb`) is left untouched, and the freshly generated stock content is buffered under `openspec/update-buffer/` with a run-summary notice, so local customizations survive updates while upstream changes stay reviewable.
