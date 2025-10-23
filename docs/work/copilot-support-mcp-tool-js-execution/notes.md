# Documentation Organization Improvement

## Problem

The previous documentation structure using `docs/issues/issue-X/` had several issues:

1. **Branch vs Issue Mismatch**: Working on branch `copilot-support-mcp-tool-js-execution` but using `docs/issues/issue-2/`
2. **Issue Number Ambiguity**: Hard to know what "issue" refers to (GitHub issue, PR number, or arbitrary)
3. **Manual Coordination**: Required manual decision about issue numbers each time
4. **Disconnected from Git Workflow**: Branch names are descriptive and always available

## Solution

Changed to **branch-based documentation organization**:

```
docs/
├── tools/           ✅ Tool documentation (permanent)
├── features/        ✅ Feature guides (permanent)
└── work/
    └── {branch-name}/   ✅ Branch-specific work docs
        ├── plan.md          • Work plan and objectives
        ├── notes.md         • Session notes and discoveries
        └── summary.md       • Implementation summary
```

## Benefits

1. **Auto-Alignment**: Branch name is always available via `git branch --show-current`
2. **Descriptive Names**: Branch names like `copilot-support-mcp-tool-js-execution` are self-documenting
3. **Natural Organization**: Work docs grouped by actual development branches
4. **No Manual Coordination**: No need to decide on issue numbers or mappings
5. **Clean Migration**: When branch is merged, work docs can be archived or moved to features/

## Current Structure

```
/docs/
├── tools/
│   └── page-execute-script.md
└── work/
    └── copilot-support-mcp-tool-js-execution/
        ├── plan.md
        ├── implementation-summary.md
        └── sse-fixes-summary.md
```

## Updated Instructions

The copilot instructions now use this branch-based approach, making future work documentation automatic and aligned with the actual development workflow.