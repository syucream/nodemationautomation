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
| `<prompt>` | Generate a workflow from your description |
| `:save <file>` | Save last workflow to file (default: workflow.json) |
| `:model <name>` | Change model (haiku/sonnet/opus) |
| `:verbose` | Toggle verbose mode on/off |
| `:help` | Show available commands |
| `:quit` | Exit interactive mode |

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

### Triggers
| Node | Type |
|------|------|
| Manual Trigger | `n8n-nodes-base.manualTrigger` |
| Webhook | `n8n-nodes-base.webhook` |
| Schedule Trigger | `n8n-nodes-base.scheduleTrigger` |
| Slack Trigger | `n8n-nodes-base.slackTrigger` |

### Actions
| Node | Type |
|------|------|
| HTTP Request | `n8n-nodes-base.httpRequest` |
| Slack | `n8n-nodes-base.slack` |

### Control Flow
| Node | Type |
|------|------|
| Set | `n8n-nodes-base.set` |
| IF | `n8n-nodes-base.if` |
| Code | `n8n-nodes-base.code` |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `CLAUDE_MODEL` | No | Default model alias or full ID (default: `haiku`) |
| `N8N_API_KEY` | No | n8n API key (for future API integration) |
| `N8N_BASE_URL` | No | n8n instance URL (default: `http://localhost:5678`) |

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
# Run tests
npm test

# Watch mode for tests
npm run test:watch

# Type check
npx tsc --noEmit

# Build
npm run build
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
│   └── index.ts          # Tool definitions for Claude
└── workflow/
    ├── types.ts          # n8n workflow type definitions
    ├── state.ts          # Workflow state management
    ├── node-registry.ts  # Supported node definitions
    └── validator.ts      # JSON schema validation
```

## Roadmap

- [ ] REST API server (Hono)
- [ ] Slack Bot integration
- [ ] More node types (Google Sheets, Airtable, etc.)
- [ ] n8n API integration (create workflows directly)
- [ ] Workflow history in interactive mode

## License

MIT
