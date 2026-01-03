# Tasks: NodeMation CLI

**Input**: Design documents from `/specs/nodemation-cli/`
**Prerequisites**: plan.md (required), spec.md (required)

**Status**: Implementation Complete

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: User story (US1, US2, US3, US4)
- ✅ = Complete

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create project structure (package.json, tsconfig.json)
- [x] T002 TypeScript + dependency setup
- [x] T003 [P] ESLint/Prettier configuration
- [x] T004 [P] Environment variable management (src/config/env.ts)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Foundation required for all user stories

- [x] T005 n8n workflow type definitions (src/workflow/types.ts)
- [x] T006 Workflow state management (src/workflow/state.ts)
- [x] T007 [P] Local validator (src/workflow/validator.ts)
- [x] T008 [P] Tool definitions & execution (src/tools/index.ts)
- [x] T009 System prompts (src/agent/prompts.ts)
- [x] T010 Claude API integration (src/agent/workflow-builder.ts)

**Checkpoint**: Foundation ready

---

## Phase 3: User Story 1 - Workflow Generation (Priority: P1)

**Goal**: Generate n8n JSON from natural language

**Independent Test**: `npm run dev -- "Send Slack notification"` outputs JSON

### Implementation

- [x] T011 [US1] add_node tool implementation
- [x] T012 [US1] connect_nodes tool implementation
- [x] T013 [US1] update_node_parameters tool implementation
- [x] T014 [US1] get_current_workflow tool implementation
- [x] T015 [US1] Node definition extraction script (scripts/extract-nodes.mjs)
- [x] T016 [US1] Get node types from .node.json (case-sensitive handling)
- [x] T017 [US1] Progress display (Building workflow...)

### Tests

- [x] T018 [P] [US1] state.test.ts
- [x] T019 [P] [US1] validator.test.ts
- [x] T020 [P] [US1] tools/index.test.ts

**Checkpoint**: Workflow generation works

---

## Phase 4: User Story 2 - Interactive Mode (Priority: P2)

**Goal**: Build workflows in REPL format

**Independent Test**: `npm run dev` enters interactive mode

### Implementation

- [x] T021 [US2] CLI entry point (src/index.ts)
- [x] T022 [US2] REPL interface
- [x] T023 [US2] Command parser (/new, /help, /quit, etc.)
- [x] T024 [US2] Context continuation feature (conversationLog)
- [x] T025 [US2] /status command
- [x] T026 [US2] /model command
- [x] T027 [US2] /verbose command

**Checkpoint**: Interactive mode works

---

## Phase 5: User Story 3 - File/Clipboard Output (Priority: P3)

**Goal**: Save and copy workflows

**Independent Test**: `/save`, `/copy` commands

### Implementation

- [x] T028 [US3] /save command
- [x] T029 [US3] /copy command (pbcopy)
- [x] T030 [US3] -o, --output option

**Checkpoint**: Output features work

---

## Phase 6: User Story 4 - n8n API Integration (Priority: P4)

**Goal**: Validation and deployment via n8n API

**Independent Test**: `/validate`, `/deploy` after setting N8N_API_KEY

### Implementation

- [x] T031 [US4] n8n API client (src/tools/n8n-api.ts)
- [x] T032 [US4] validate_workflow_with_n8n tool
- [x] T033 [US4] create_workflow_in_n8n tool
- [x] T034 [US4] /validate command
- [x] T035 [US4] /deploy command
- [x] T036 [US4] Placeholder API key detection
- [x] T037 [US4] Validation strategy guidance (prompts)

**Checkpoint**: n8n API integration works

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements and cross-cutting concerns

- [x] T038 Silence extract-nodes logs
- [x] T039 Dynamic trigger node detection
- [x] T040 @n8n/n8n-nodes-langchain support
- [ ] T041 Fix paths for failed node extractions (4 nodes)
- [ ] T042 Localize error messages
- [ ] T043 Support additional node types

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3-6 (User Stories) → Phase 7 (Polish)
```

### User Story Dependencies

- **US1 (Workflow Generation)**: Can start after Phase 2 complete
- **US2 (Interactive Mode)**: Depends on US1
- **US3 (Output)**: Depends on US1
- **US4 (n8n API)**: Depends on US1, can be tested independently

---

## Implementation Status

| Phase | Status | Tasks |
|-------|--------|-------|
| Phase 1: Setup | ✅ Complete | T001-T004 |
| Phase 2: Foundational | ✅ Complete | T005-T010 |
| Phase 3: US1 Workflow Generation | ✅ Complete | T011-T020 |
| Phase 4: US2 Interactive Mode | ✅ Complete | T021-T027 |
| Phase 5: US3 Output | ✅ Complete | T028-T030 |
| Phase 6: US4 n8n API | ✅ Complete | T031-T037 |
| Phase 7: Polish | 🔄 In Progress | T038-T040 done, T041-T043 pending |

**Overall Progress**: 40/43 tasks complete (93%)
