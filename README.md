# n8n9n: NodeMation Automation

A CLI tool that generates n8n-compatible workflow JSON from natural language descriptions using Claude AI.

## Features

- **Natural Language to Workflow**: Describe what you want to automate, get valid n8n workflow JSON
- **n8n Compatible**: Generated JSON can be imported directly into n8n
- **Validation**: Validates output against n8n workflow schema before returning
- **Multiple Claude Models**: Choose between Haiku (fast/cheap), Sonnet (balanced), or Opus (most capable)
- **Flexible Input**: Accept prompts via argument, stdin pipe, or interactive mode

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd nodemationautomation

# Install dependencies
npm install

# Copy environment template and configure
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

## Input Modes

NodeMation supports three input modes (in priority order):

### 1. STDIN (Pipe)

Pipe prompts from other commands or files:

```bash
# Pipe from echo
echo "Create a webhook that sends data to Slack" | npx tsx src/index.ts

# Pipe from file
cat prompt.txt | npx tsx src/index.ts

# Build complex prompts with other tools
jq -r '.prompt' config.json | npx tsx src/index.ts
```

### 2. Command Argument

Pass the prompt directly as an argument:

```bash
# Basic usage - outputs JSON to stdout
npx tsx src/index.ts "Create a webhook that sends a message to Slack"

# Save to file using shell redirection
npx tsx src/index.ts "HTTP request workflow" > workflow.json

# With options
npx tsx src/index.ts "Complex workflow" -m sonnet -v
```

### 3. Interactive Mode

Launch an interactive REPL when no prompt is provided:

```bash
# Enter interactive mode
npx tsx src/index.ts

# Force interactive mode even with other options
npx tsx src/index.ts -i
```

**Interactive Commands:**

| Command | Description |
|---------|-------------|
| `<prompt>` | Add to/refine the current workflow |
| `/new` | Start a new workflow (clear context) |
| `/validate` | Validate current workflow against n8n API |
| `/deploy` | Deploy workflow to n8n |
| `/status` | Show current workflow status |
| `/save <file>` | Save last workflow to file (default: workflow.json) |
| `/copy` | Copy last workflow JSON to clipboard |
| `/model <name>` | Change model (haiku/sonnet/opus) |
| `/verbose` | Toggle verbose mode on/off |
| `/help` | Show available commands |
| `/quit` | Exit interactive mode |

> **Note:** Commands start with `/` (not `:`). The n8n API commands (`/validate`, `/deploy`) require `N8N_API_KEY` to be configured.

## Usage Examples

```bash
# Simple workflow via argument
npx tsx src/index.ts "Create a webhook that sends a message to Slack"

# Pipe a prompt from a file
cat my-prompt.txt | npx tsx src/index.ts > workflow.json

# Use a specific model
npx tsx src/index.ts "Complex workflow" -m sonnet

# Verbose output (see agent reasoning)
npx tsx src/index.ts "My workflow" -v

# Set workflow name
npx tsx src/index.ts "My workflow" -n "My Custom Workflow"

# Interactive session
npx tsx src/index.ts -i
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Set workflow name (default: "Generated Workflow") |
| `-o, --output <file>` | Output file path (default: stdout) |
| `-m, --model <model>` | Claude model: `haiku`, `sonnet`, `opus`, or full model ID |
| `-v, --verbose` | Show detailed progress and agent reasoning |
| `-i, --interactive` | Force interactive mode |

## Model Selection

| Alias | Model ID | Best For |
|-------|----------|----------|
| `haiku` | claude-haiku-4-5-20251001 | Fast, cost-effective (default) |
| `sonnet` | claude-sonnet-4-5-20250929 | Balanced performance |
| `opus` | claude-opus-4-5-20251101 | Complex workflows |

You can also specify full model IDs:
```bash
npx tsx src/index.ts "My workflow" -m claude-sonnet-4-5-20250929
```

## Output

- **JSON**: Workflow JSON is written to **stdout**
- **Logs/Errors**: Progress, warnings, and errors go to **stderr**

This separation allows clean piping:
```bash
# Redirect JSON to file, see logs in terminal
npx tsx src/index.ts "My workflow" > output.json

# Suppress logs, capture JSON only
npx tsx src/index.ts "My workflow" 2>/dev/null > output.json
```

## Output Validation

Generated workflows are validated before output:

- **Schema Validation**: Ensures JSON structure matches n8n format
- **Semantic Validation**: Checks node references, connections, and IDs
- **Warnings**: Reports potential issues (e.g., missing trigger nodes)

If validation fails, an error is returned instead of invalid JSON.

## Supported Nodes

Node definitions are auto-generated from `n8n-nodes-base` package using `npm run extract-nodes`.

The agent has knowledge of all standard n8n nodes including:

- **Triggers**: Webhook, Schedule, Manual, Slack, and many more
- **Actions**: HTTP Request, Slack, Set, Code, IF, and 400+ integrations
- **Control Flow**: IF, Switch, Merge, Split, Loop, and other flow control nodes

Claude uses its knowledge of n8n combined with the extracted node definitions to generate valid workflows. Run `npm run extract-nodes:verbose` to see all available nodes.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `CLAUDE_MODEL` | No | Default model alias or full ID (default: `haiku`) |
| `N8N_API_KEY` | No | n8n API key (enables `/validate` and `/deploy` commands) |
| `N8N_BASE_URL` | No | n8n instance URL (default: `http://localhost:5678`) |
| `MAX_VALIDATION_RETRIES` | No | Max retries for validation failures before asking human (default: `3`) |

## Example Output

```bash
$ npx tsx src/index.ts "Webhook that sends data to Slack #general"

{
  "name": "Generated Workflow",
  "nodes": [
    {
      "id": "node_1",
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [100, 100],
      "parameters": {
        "httpMethod": "POST",
        "path": "webhook"
      }
    },
    {
      "id": "node_2",
      "name": "Send to Slack",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2,
      "position": [350, 100],
      "parameters": {
        "resource": "message",
        "operation": "post",
        "channel": "#general",
        "text": "={{ $json }}"
      }
    }
  ],
  "connections": {
    "Webhook Trigger": {
      "main": [[{ "node": "Send to Slack", "type": "main", "index": 0 }]]
    }
  },
  "settings": { "executionOrder": "v1" }
}
```

## Development

```bash
# Extract n8n node definitions (required before build)
npm run extract-nodes

# Run tests
npm test

# Watch mode for tests
npm run test:watch

# Lint
npm run lint
npm run lint:fix

# Format
npm run format
npm run format:check

# Run all checks
npm run check

# Type check
npx tsc --noEmit

# Build (includes extract-nodes)
npm run build

# Development mode
npm run dev
```

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── config/
│   └── env.ts            # Environment configuration
├── agent/
│   ├── prompts.ts        # System prompts for Claude
│   └── workflow-builder.ts  # Main agent logic
├── tools/
│   ├── index.ts          # Tool definitions for Claude
│   └── n8n-api.ts        # n8n REST API client
├── workflow/
│   ├── types.ts          # n8n workflow type definitions
│   ├── state.ts          # Workflow state management
│   └── validator.ts      # JSON schema validation
└── generated/
    └── node-definitions.json  # Auto-generated n8n node definitions
```

## Roadmap

- [x] n8n API integration (validate and deploy workflows directly)
- [ ] REST API server (Hono)
- [ ] Slack Bot integration
- [ ] Workflow history in interactive mode

## License

MIT
