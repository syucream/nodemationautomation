# Implementation Plan: NodeMation CLI

**Branch**: `main` | **Date**: 2025-01-03 | **Spec**: [spec.md](./spec.md)
**Input**: Re-implementation of n8n AI Workflow Builder using Claude API

## Summary

A CLI tool that generates n8n workflow JSON from natural language. Uses Claude API's Tool Use feature to provide workflow building tools to the AI, enabling incremental workflow construction.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: @anthropic-ai/sdk, commander, zod
**Storage**: None (stateless, in-memory state management only)
**Testing**: vitest
**Target Platform**: Node.js 18+
**Project Type**: single (CLI)
**Performance Goals**: Workflow generation within 10 seconds
**Constraints**: API key required (ANTHROPIC_API_KEY)
**Scale/Scope**: CLI tool for individual developers

## Constitution Check

*N/A (constitution not defined)*

## Project Structure

### Documentation (this feature)

```text
specs/nodemation-cli/
├── spec.md              # Feature specification
├── plan.md              # This file (implementation plan)
└── tasks.md             # Task list
```

### Source Code (repository root)

```text
src/
├── index.ts             # CLI entry point
├── agent/
│   ├── workflow-builder.ts  # Claude API integration
│   └── prompts.ts           # System prompts
├── tools/
│   ├── index.ts             # Tool definitions & execution
│   └── n8n-api.ts           # n8n API client
├── workflow/
│   ├── state.ts             # Workflow state management
│   ├── validator.ts         # Local validation
│   └── types.ts             # Type definitions
├── config/
│   └── env.ts               # Environment variables
└── generated/
    └── node-definitions.json # Extracted node definitions (auto-generated)

scripts/
└── extract-nodes.mjs        # Node definition extraction script

tests/ (placed as *.test.ts within src/)
```

**Structure Decision**: Single project structure. All code placed under `src/` as a CLI tool.

## Key Design Decisions

### 1. Node Definition Acquisition Method

| Approach | Adopted | Reason |
|----------|---------|--------|
| Manual node definition management | ❌ | High maintenance cost |
| n8n internal API | ❌ | Complex auth/infrastructure |
| **Extract from NPM packages** | ✅ | Auto-extract at build time, official source |

### 2. Validation Strategy

```
Layer 1: Local validation (Zod) → Always executed
Layer 2: n8n API validation → Optional, AI decides
```

### 3. Node Type Case Sensitivity

**Important**: n8n strictly distinguishes node type case.

```
❌ n8n-nodes-base.manualtrigger
✅ n8n-nodes-base.manualTrigger
```

Resolved by extracting accurate type names from `.node.json` files.

### 4. AI-Driven Validation Decisions

Prompts include guidance for AI to decide based on context:

- **Validate**: Complex workflows, after significant changes
- **Skip**: Credentials not set, user prefers manual configuration
- **Retry limit**: Stop after 2-3 attempts

## Dependencies

### Runtime

```json
{
  "@anthropic-ai/sdk": "^0.32.1",
  "commander": "^12.1.0",
  "dotenv": "^16.4.7",
  "zod": "^3.24.1"
}
```

### Development

```json
{
  "@n8n/n8n-nodes-langchain": "^2.1.4",
  "n8n-nodes-base": "^2.1.4",
  "tsx": "^4.19.2",
  "typescript": "^5.7.2",
  "vitest": "^2.1.9"
}
```

## Complexity Tracking

| Item | Current | Notes |
|------|---------|-------|
| Node count | 70 | n8n-nodes-base + langchain |
| Extraction failures | 4 | Fixable with path corrections |
| File count | 12 | Under src/ |
| Test coverage | 44 tests | state, validator, tools |
