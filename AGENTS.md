<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Before Finishing Work

Before marking any task complete, opening a PR, or committing:

1. **Run lint** — `biome ci .` must pass with no errors.
2. **Update seed script** — if you changed the database schema (added/removed tables, columns, or relations), update the seed script to reflect those changes.
3. **All tests must pass** — run the full test suite and fix any failures before handing off.
