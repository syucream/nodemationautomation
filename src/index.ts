#!/usr/bin/env node
/**
 * NodeMation Automation CLI
 * Generate n8n workflows from natural language using Claude AI.
 *
 * Input modes (in priority order):
 * 1. STDIN (pipe): echo "prompt" | nodemation
 * 2. Argument: nodemation "prompt"
 * 3. Interactive: nodemation (launches REPL)
 */

import { Command } from 'commander';
import * as readline from 'readline';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { buildWorkflow, type BuildResult } from './agent/workflow-builder.js';
import type { N8nWorkflow } from './workflow/types.js';
import { workflowState } from './workflow/state.js';
import { initializeN8nClient, isN8nApiAvailable } from './tools/index.js';
import { createN8nApiClient } from './tools/n8n-api.js';
import { env } from './config/env.js';

interface CliOptions {
  name: string;
  output?: string;
  model?: string;
  verbose?: boolean;
  interactive?: boolean;
}

const program = new Command();

program
  .name('nodemation')
  .description('Generate n8n workflows from natural language using Claude AI')
  .version('0.1.0');

program
  .argument('[prompt]', 'Natural language description of the workflow')
  .option('-n, --name <name>', 'Workflow name', 'Generated Workflow')
  .option('-o, --output <file>', 'Output file path (default: stdout)')
  .option(
    '-m, --model <model>',
    'Claude model: haiku, sonnet, opus, or full model ID (default: haiku)'
  )
  .option('-v, --verbose', 'Show detailed progress')
  .option('-i, --interactive', 'Force interactive mode')
  .action(async (prompt: string | undefined, options: CliOptions) => {
    try {
      await main(prompt, options);
    } catch (error) {
      console.error(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

program.parse();

/**
 * Main entry point - determines input mode and executes
 */
async function main(argPrompt: string | undefined, options: CliOptions): Promise<void> {
  // Force interactive mode if -i flag is set
  if (options.interactive) {
    await runInteractiveMode(options);
    return;
  }

  // Check for stdin input (piped data)
  const stdinPrompt = await readStdin();

  if (stdinPrompt) {
    // Mode 1: STDIN
    if (options.verbose) {
      console.error('Reading prompt from stdin...');
    }
    await executeWorkflow(stdinPrompt, options);
  } else if (argPrompt) {
    // Mode 2: Argument
    await executeWorkflow(argPrompt, options);
  } else {
    // Mode 3: Interactive
    await runInteractiveMode(options);
  }
}

/**
 * Read from stdin if data is being piped
 */
async function readStdin(): Promise<string | null> {
  // Check if stdin is a TTY (terminal) - if so, no piped data
  if (process.stdin.isTTY) {
    return null;
  }

  return new Promise((resolve) => {
    let data = '';
    const timeout = setTimeout(() => {
      // No data received within timeout, assume no stdin
      resolve(null);
    }, 100);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      clearTimeout(timeout);
      data += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(timeout);
      const trimmed = data.trim();
      resolve(trimmed || null);
    });
    process.stdin.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

/**
 * Execute workflow generation with the given prompt
 */
async function executeWorkflow(
  prompt: string,
  options: CliOptions & { continueFrom?: string[] }
): Promise<BuildResult> {
  const { name, output, model, verbose, continueFrom } = options;

  if (verbose && !continueFrom) {
    console.error('Building workflow...');
    console.error(`Prompt: "${prompt}"`);
    if (model) {
      console.error(`Model: ${model}`);
    }
    console.error('');
  }

  const result = await buildWorkflow(prompt, {
    verbose,
    model,
    continueFrom,
  });

  if (!result.success) {
    console.error(`Error: ${result.error}`);

    if (result.requiresHumanInput) {
      console.error(`\nHuman input needed: ${result.humanInputReason}`);
    }

    if (verbose && result.conversationLog.length > 0) {
      console.error('\nConversation log:');
      for (const log of result.conversationLog) {
        console.error(`  ${log}`);
      }
    }
    return result;
  }

  // Update workflow name if specified
  if (result.workflow && name) {
    result.workflow.name = name;
  }

  // Show validation warnings if any
  if (result.validationWarnings && result.validationWarnings.length > 0) {
    console.error('\nWarnings:');
    for (const warning of result.validationWarnings) {
      console.error(`  - ${warning}`);
    }
  }

  // Output JSON
  const jsonOutput = JSON.stringify(result.workflow, null, 2);
  if (output) {
    fs.writeFileSync(output, jsonOutput);
    if (verbose) {
      console.error(`Saved to ${output}`);
    }
  } else {
    console.log(jsonOutput);
  }

  if (verbose) {
    console.error('\nWorkflow created successfully!');
    console.error(`Nodes: ${result.workflow?.nodes.length || 0}`);
    if (result.validationAttempts && result.validationAttempts > 0) {
      console.error(`Validation attempts: ${result.validationAttempts}`);
    }
  }

  return result;
}

/**
 * Run interactive REPL mode
 */
async function runInteractiveMode(options: CliOptions): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // Use stderr for prompts so stdout stays clean for JSON
    terminal: true,
  });

  // Initialize n8n client
  initializeN8nClient();
  const n8nApiAvailable = isN8nApiAvailable();

  console.error('NodeMation Automation - Interactive Mode');
  console.error('========================================');
  console.error('Commands:');
  console.error('  <prompt>          Add to/refine the current workflow');
  console.error('  /new              Start a new workflow (clear context)');
  console.error('  /validate         Validate current workflow against n8n API');
  console.error('  /deploy           Deploy workflow to n8n');
  console.error('  /status           Show current workflow status');
  console.error('  /save <file>      Save last workflow to file');
  console.error('  /copy             Copy last workflow JSON to clipboard');
  console.error('  /model <name>     Change model (haiku/sonnet/opus)');
  console.error('  /verbose          Toggle verbose mode');
  console.error('  /help             Show this help');
  console.error('  /quit             Exit');
  console.error('');

  if (n8nApiAvailable) {
    console.error('n8n API: connected');
  } else {
    console.error('n8n API: not configured (set N8N_API_KEY to enable)');
  }
  console.error('');

  let lastWorkflow: N8nWorkflow | null = null;
  let lastBuildResult: BuildResult | null = null;
  let currentModel = options.model;
  let verbose = options.verbose || false;

  const prompt = (): void => {
    rl.question('nodemation> ', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // Handle commands
      if (trimmed.startsWith('/')) {
        await handleCommand(trimmed);
        prompt();
        return;
      }

      // Generate/refine workflow (always continue from previous context)
      console.error('');
      const result = await executeWorkflow(trimmed, {
        name: options.name,
        model: currentModel,
        verbose,
        continueFrom: lastBuildResult?.conversationLog,
      });

      lastBuildResult = result;
      if (result.success && result.workflow) {
        lastWorkflow = result.workflow;
      }

      console.error('');
      prompt();
    });
  };

  async function handleCommand(cmd: string): Promise<void> {
    const parts = cmd.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    switch (command) {
      case 'new': {
        workflowState.reset();
        lastWorkflow = null;
        lastBuildResult = null;
        console.error('Context cleared. Starting fresh.');
        break;
      }

      case 'validate': {
        if (!lastWorkflow) {
          console.error('No workflow to validate. Generate one first.');
          return;
        }

        if (!n8nApiAvailable) {
          console.error('n8n API not configured. Set N8N_API_KEY to enable validation.');
          return;
        }

        console.error('Validating against n8n API...');
        const client = createN8nApiClient(env.N8N_BASE_URL, env.N8N_API_KEY);
        if (!client) {
          console.error('Failed to create n8n API client.');
          return;
        }

        try {
          const result = await client.validateByCreation(lastWorkflow);
          if (result.valid) {
            console.error('✓ Workflow is valid!');
          } else {
            console.error(`✗ Validation failed: ${result.error?.message}`);
            if (result.error?.details) {
              console.error(`  Details: ${JSON.stringify(result.error.details)}`);
            }
          }
        } catch (error) {
          console.error(
            `✗ Validation error: ${error instanceof Error ? error.message : 'Unknown'}`
          );
        }
        break;
      }

      case 'deploy': {
        if (!lastWorkflow) {
          console.error('No workflow to deploy. Generate one first.');
          return;
        }

        if (!n8nApiAvailable) {
          console.error('n8n API not configured. Set N8N_API_KEY to enable deployment.');
          return;
        }

        console.error('Deploying to n8n...');
        const client = createN8nApiClient(env.N8N_BASE_URL, env.N8N_API_KEY);
        if (!client) {
          console.error('Failed to create n8n API client.');
          return;
        }

        try {
          const response = await client.createWorkflow(lastWorkflow);
          console.error(`✓ Deployed! ID: ${response.id}`);
          console.error(`  URL: ${env.N8N_BASE_URL}/workflow/${response.id}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`✗ Deploy failed: ${errorMsg}`);
        }
        break;
      }

      case 'status': {
        console.error('\nCurrent Status:');
        console.error(`  Model: ${currentModel || 'haiku (default)'}`);
        console.error(`  Verbose: ${verbose ? 'on' : 'off'}`);
        console.error(`  n8n API: ${n8nApiAvailable ? 'connected' : 'not configured'}`);

        if (lastWorkflow) {
          console.error(`\nLast Workflow:`);
          console.error(`  Name: ${lastWorkflow.name}`);
          console.error(`  Nodes: ${lastWorkflow.nodes.length}`);
          console.error(`  Connections: ${Object.keys(lastWorkflow.connections).length}`);
        } else {
          console.error('\nNo workflow generated yet.');
        }

        if (lastBuildResult) {
          if (lastBuildResult.validationAttempts) {
            console.error(`  Validation attempts: ${lastBuildResult.validationAttempts}`);
          }
          if (lastBuildResult.requiresHumanInput) {
            console.error(`  Needs input: ${lastBuildResult.humanInputReason}`);
          }
        }
        break;
      }

      case 'save': {
        if (!lastWorkflow) {
          console.error('No workflow to save. Generate one first.');
          return;
        }
        const filename = args.trim() || 'workflow.json';
        try {
          fs.writeFileSync(filename, JSON.stringify(lastWorkflow, null, 2));
          console.error(`Saved to ${filename}`);
        } catch (error) {
          console.error(
            `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
        break;
      }

      case 'copy': {
        if (!lastWorkflow) {
          console.error('No workflow to copy. Generate one first.');
          return;
        }
        try {
          const json = JSON.stringify(lastWorkflow, null, 2);
          execSync('pbcopy', { input: json });
          console.error('Copied workflow JSON to clipboard!');
        } catch (error) {
          console.error(
            `Failed to copy: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
        break;
      }

      case 'model': {
        if (args.trim()) {
          currentModel = args.trim();
          console.error(`Model changed to: ${currentModel}`);
        } else {
          console.error(`Current model: ${currentModel || 'haiku (default)'}`);
        }
        break;
      }

      case 'verbose': {
        verbose = !verbose;
        console.error(`Verbose mode: ${verbose ? 'on' : 'off'}`);
        break;
      }

      case 'help': {
        console.error('Commands:');
        console.error('  <prompt>          Add to/refine the current workflow');
        console.error('  /new              Start a new workflow (clear context)');
        console.error('  /validate         Validate current workflow against n8n API');
        console.error('  /deploy           Deploy workflow to n8n');
        console.error('  /status           Show current workflow status');
        console.error('  /save <file>      Save last workflow to file');
        console.error('  /copy             Copy last workflow JSON to clipboard');
        console.error('  /model <name>     Change model (haiku/sonnet/opus)');
        console.error('  /verbose          Toggle verbose mode');
        console.error('  /help             Show this help');
        console.error('  /quit             Exit');
        break;
      }

      case 'quit':
      case 'exit':
      case 'q': {
        console.error('Goodbye!');
        rl.close();
        process.exit(0);
        break;
      }

      default: {
        console.error(`Unknown command: ${command}`);
        console.error('Type /help for available commands');
        break;
      }
    }
  }

  rl.on('close', () => {
    process.exit(0);
  });

  prompt();
}
