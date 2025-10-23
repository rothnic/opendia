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
│   └── work/
│       └── branch-name/
│           ├── plan.md    ✅ Branch work plan
│           ├── notes.md   ✅ Session notes
│           └── summary.md ✅ Implementation summary
└── ❌ NO other .md files in root
```

### Rules

1. **Root**: Only `README.md` and `AGENTS.md`
2. **Tool docs**: `docs/tools/tool-name.md` (dash-delimited)
3. **Feature docs**: `docs/features/feature-name.md` (dash-delimited)
4. **Work docs**: `docs/work/branch-name/` (based on current git branch)
5. **PR summaries**: Put in PR description, not separate files
6. **Naming**: Use dashes not underscores (`tool-name.md` not `tool_name.md`)

### Branch-Based Work Documentation

Use current git branch name (auto-detectable) for work organization:
- `docs/work/copilot-support-mcp-tool-js-execution/` (current branch)
- `docs/work/feature-background-tab-support/` (example)
- `docs/work/fix-sse-implementation/` (example)

### When to Create New Folders

Create new folder when:
- Adding first tool doc → create `docs/tools/`
- Adding first feature doc → create `docs/features/`
- Starting work on new branch → create `docs/work/{branch-name}/`
- Multiple related docs need grouping → create appropriate subfolder

### Examples

✅ **Good**:
- `docs/tools/page-execute-script.md`
- `docs/features/mcp-integration.md`
- `docs/work/copilot-support-mcp-tool-js-execution/plan.md`
- `docs/work/copilot-support-mcp-tool-js-execution/sse-fixes.md`

❌ **Bad**:
- `PR_SUMMARY.md` (root)
- `docs/page_execute_script.md` (no category folder)
- `docs/tools/tool_name.md` (underscores)
- `docs/issues/notes.md` (unclear issue reference)
- `docs/work/notes.md` (no branch folder)
