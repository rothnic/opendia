# GitHub Copilot Custom Instructions

## Markdown File Organization

### Project Structure
```
opendia/
├── README.md              ✅ Main docs only
├── AGENTS.md              ✅ Agent docs (if needed)
├── docs/
│   ├── tools/
│   │   └── tool-name.md   ✅ Tool documentation
│   ├── features/
│   │   └── feature-name.md ✅ Feature guides
│   └── issues/
│       └── issue-1/
│           ├── plan.md    ✅ Issue-specific notes
│           └── notes.md   ✅ Session notes
└── ❌ NO other .md files in root
```

### Rules

1. **Root**: Only `README.md` and `AGENTS.md`
2. **Tool docs**: `docs/tools/tool-name.md` (dash-delimited)
3. **Feature docs**: `docs/features/feature-name.md` (dash-delimited)
4. **Issue notes**: `docs/issues/issue-X/notes.md` (each issue gets own folder)
5. **PR summaries**: Put in PR description, not separate files
6. **Naming**: Use dashes not underscores (`tool-name.md` not `tool_name.md`)

### When to Create New Folders

Create new folder when:
- Adding first tool doc → create `docs/tools/`
- Adding first feature doc → create `docs/features/`
- Starting work on an issue → create `docs/issues/issue-X/`
- Multiple related docs need grouping → create appropriate subfolder

### Examples

✅ **Good**:
- `docs/tools/page-execute-script.md`
- `docs/features/mcp-integration.md`
- `docs/issues/issue-1/plan.md`

❌ **Bad**:
- `PR_SUMMARY.md` (root)
- `docs/page_execute_script.md` (no category folder)
- `docs/tools/tool_name.md` (underscores)
- `docs/issues/notes.md` (no issue folder)
