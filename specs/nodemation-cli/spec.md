# Feature Specification: NodeMation CLI

**Feature Branch**: `main`
**Created**: 2025-01-03
**Status**: Implemented
**Input**: Re-implementation of n8n AI Workflow Builder using Claude API

## User Scenarios & Testing

### User Story 1 - Workflow Generation (Priority: P1)

Generate n8n-importable JSON from natural language workflow descriptions.

**Why this priority**: Core functionality. Without this, the tool has no value.

**Independent Test**: Run `npm run dev -- "Send a Slack notification"` and verify valid n8n JSON output.

**Acceptance Scenarios**:

1. **Given** CLI is running, **When** user inputs "Send a Slack notification", **Then** JSON containing Manual Trigger → Slack nodes is generated
2. **Given** CLI is running, **When** user inputs a prompt with multiple nodes, **Then** properly connected JSON is generated
3. **Given** generated JSON, **When** imported to n8n, **Then** nodes and connections display correctly

---

### User Story 2 - Interactive Mode (Priority: P2)

Build and modify workflows incrementally in REPL format.

**Why this priority**: Required for building complex workflows step-by-step.

**Independent Test**: Run `npm run dev` to enter interactive mode and extend workflows with additional prompts.

**Acceptance Scenarios**:

1. **Given** launched in interactive mode, **When** user inputs a prompt, **Then** workflow is generated
2. **Given** workflow generated, **When** user inputs additional prompt, **Then** existing workflow is extended
3. **Given** interactive mode, **When** `/new` command, **Then** context is reset

---

### User Story 3 - File/Clipboard Output (Priority: P3)

Save generated workflows to file or copy to clipboard.

**Why this priority**: Usability improvement. Makes pasting to n8n easier.

**Independent Test**: `/save workflow.json` saves to file, `/copy` copies to clipboard.

**Acceptance Scenarios**:

1. **Given** workflow generated, **When** `/save test.json`, **Then** workflow is saved to test.json
2. **Given** workflow generated, **When** `/copy`, **Then** JSON is copied to clipboard
3. **Given** one-shot mode, **When** `-o output.json` option, **Then** output goes to output.json

---

### User Story 4 - n8n API Integration (Priority: P4)

Validate and deploy workflows using n8n API.

**Why this priority**: Optional feature. Requires API key configuration.

**Independent Test**: After setting N8N_API_KEY, `/validate` and `/deploy` work.

**Acceptance Scenarios**:

1. **Given** N8N_API_KEY is set, **When** `/validate`, **Then** validation result from n8n API is displayed
2. **Given** N8N_API_KEY is set, **When** `/deploy`, **Then** workflow is created in n8n
3. **Given** N8N_API_KEY is not set, **When** `/validate`, **Then** appropriate error message is displayed

---

### Edge Cases

- What happens with invalid node types? → AI recognizes the error and attempts to fix
- What about nodes requiring credentials? → Notify user and output workflow anyway
- What about circular connections? → Local validation error

## Requirements

### Functional Requirements

- **FR-001**: System must generate n8n-compatible JSON from natural language prompts
- **FR-002**: System must support both interactive and one-shot modes
- **FR-003**: System must locally validate generated workflows
- **FR-004**: System must support 70+ n8n node types
- **FR-005**: System must support remote validation when n8n API is available
- **FR-006**: System must provide progress indicators

### Key Entities

- **Workflow**: name, nodes[], connections{}, settings
- **Node**: id, name, type, typeVersion, position, parameters, credentials?
- **Connection**: sourceNode, targetNode, sourceOutput, targetInput, connectionType

## Success Criteria

### Measurable Outcomes

- **SC-001**: Generated JSON imports and works correctly in n8n
- **SC-002**: Node type casing is accurate (`manualTrigger` not `manualtrigger`)
- **SC-003**: Connections are generated correctly and display as edges in n8n
- **SC-004**: Progress is shown even in non-verbose mode
