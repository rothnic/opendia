# GitHub Copilot Custom Instructions

## Markdown File Organization

### Root Directory
**Only the following markdown files are allowed in the project root:**
- `README.md` - Main project documentation
- `AGENTS.md` - Agent-related documentation (if needed)

### Documentation Structure
All other markdown files must be organized as follows:

#### Tool and Feature Documentation
- Location: `docs/`
- Purpose: Persistent documentation for tools, features, and guides
- Examples:
  - `docs/tool_name.md` - Documentation for a specific tool
  - `docs/feature_guide.md` - Guide for a feature
  - `docs/api_reference.md` - API documentation

#### Session and Implementation Notes
- Location: `docs/issues/<issue-number>/`
- Purpose: Session-related notes, implementation summaries, and PR-specific documentation
- Structure: Each issue gets its own folder named after the issue number
- Examples:
  - `docs/issues/issue-1/plan.md` - Implementation plan for issue #1
  - `docs/issues/issue-1/notes.md` - Session notes for issue #1
  - `docs/issues/issue-1/implementation_summary.md` - Summary of what was done and why
  - `docs/issues/issue-123/design_decisions.md` - Design decisions for issue #123

### Rules for New Markdown Files

1. **Never create markdown files in the project root** except for `README.md` and `AGENTS.md`

2. **For tool/feature documentation:**
   - Create files in `docs/` directory
   - Use lowercase filenames with underscores: `tool_name.md`
   - Focus on user-facing documentation

3. **For implementation notes and summaries:**
   - Create files in `docs/issues/<issue-number>/` directory
   - Each issue should have its own folder: `docs/issues/issue-1/`, `docs/issues/issue-123/`
   - Use descriptive names: `plan.md`, `notes.md`, `implementation_summary.md`
   - Include session-related details, reasoning, and decisions

4. **PR summaries and descriptions:**
   - Include all PR-related information in the PR description itself
   - Do not create separate markdown files for PR summaries
   - Use the GitHub PR interface for this content

### Naming Conventions

- **Uppercase names** are reserved for special cases: `README.md`, `AGENTS.md`
- **Lowercase with underscores** for all other files: `page_execute_script.md`, `implementation_summary.md`
- **Descriptive names** that clearly indicate the file's purpose
- **No abbreviations** unless they are widely understood (API, UI, etc.)

### Examples

✅ **Correct:**
```
README.md                                      # Root level - special case
docs/page_execute_script.md                  # Tool documentation
docs/issues/issue-1/implementation_summary.md # Session notes for issue #1
docs/issues/issue-1/plan.md                  # Implementation plan for issue #1
docs/issues/issue-123/notes.md               # Session notes for issue #123
```

❌ **Incorrect:**
```
PR_SUMMARY.md                            # Should be in PR description
IMPLEMENTATION_SUMMARY.md                # Should be in docs/issues/issue-X/
docs/TOOL_GUIDE.md                       # Should be lowercase
docs/issues/summary.md                   # Should be in docs/issues/issue-X/
docs/issues/issue_123_notes.md           # Should be in docs/issues/issue-123/notes.md
```

### Migration Guide

If you find markdown files in incorrect locations:
1. Remove any `*_SUMMARY.md` or similar files from the project root
2. Move implementation/session notes to `docs/issues/issue-X/` where X is the issue number
3. Keep tool/feature docs in `docs/`
4. Ensure only `README.md` and `AGENTS.md` remain in root
5. Organize issue-specific files into their own folders under `docs/issues/`

## Rationale

This organization:
- Keeps the project root clean and uncluttered
- Clearly separates persistent documentation from session notes
- Makes it easy to find and maintain documentation
- Follows common open-source project conventions
- Prevents documentation sprawl
