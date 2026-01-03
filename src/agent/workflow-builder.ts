/**
 * Workflow Builder Agent
 * Uses Claude API with tool use to build n8n workflows.
 * Supports self-correcting validation loops and human-in-the-loop.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env, resolveModelId } from '../config/env.js';
import { getSystemPrompt } from './prompts.js';
import {
  executeToolAsync,
  getToolDefinitions,
  initializeN8nClient,
  isN8nApiAvailable,
} from '../tools/index.js';
import { workflowState } from '../workflow/state.js';
import { validateWorkflow } from '../workflow/validator.js';
import type { N8nWorkflow } from '../workflow/types.js';

const MAX_TURNS = 20;

export interface ProgressEvent {
  type: 'TURN_START' | 'TOOL_CALL' | 'TOOL_RESULT' | 'VALIDATION' | 'RETRY' | 'ERROR' | 'SUCCESS';
  turn?: number;
  toolName?: string;
  message: string;
  details?: unknown;
}

export interface BuildOptions {
  verbose?: boolean;
  /** Model alias (haiku, sonnet, opus) or full model ID */
  model?: string;
  /** Callback for progress events */
  onProgress?: (event: ProgressEvent) => void;
  /** Continue from previous conversation context */
  continueFrom?: string[];
}

export interface BuildResult {
  success: boolean;
  workflow?: N8nWorkflow;
  error?: string;
  validationWarnings?: string[];
  conversationLog: string[];
  model: string;
  /** Number of validation attempts made */
  validationAttempts?: number;
  /** Whether human input is required to proceed */
  requiresHumanInput?: boolean;
  /** Reason why human input is needed */
  humanInputReason?: string;
}

/**
 * Emit a progress event
 */
function emitProgress(options: BuildOptions, event: ProgressEvent, verbose: boolean): void {
  if (options.onProgress) {
    options.onProgress(event);
  }

  if (verbose) {
    // Verbose mode: detailed output
    switch (event.type) {
      case 'TURN_START':
        console.error(`\n--- Turn ${event.turn} ---`);
        break;
      case 'TOOL_CALL':
        console.error(`  > ${event.toolName}: ${event.message}`);
        break;
      case 'TOOL_RESULT':
        console.error(`    ${event.message}`);
        break;
      case 'VALIDATION':
        console.error(`  ⚡ ${event.message}`);
        break;
      case 'RETRY':
        console.error(`  ↻ ${event.message}`);
        break;
      case 'ERROR':
        console.error(`\n✗ Error: ${event.message}`);
        break;
      case 'SUCCESS':
        console.error(`\n✓ Success: ${event.message}`);
        break;
    }
  } else {
    // Non-verbose mode: minimal progress indicators
    switch (event.type) {
      case 'TURN_START':
        if (event.turn === 1) {
          process.stderr.write('Building workflow');
        }
        process.stderr.write('.');
        break;
      case 'ERROR':
        console.error(`\n✗ ${event.message}`);
        break;
      case 'SUCCESS':
        console.error(` Done!`);
        break;
    }
  }
}

/**
 * Analyze validation error to determine if it's recoverable
 */
function analyzeValidationError(errorMessage: string): {
  recoverable: boolean;
  suggestedAction?: string;
} {
  const lowerMessage = errorMessage.toLowerCase();

  // Credential-related errors are NOT recoverable by the agent
  if (
    lowerMessage.includes('credential') ||
    lowerMessage.includes('oauth') ||
    lowerMessage.includes('api key') ||
    lowerMessage.includes('authentication')
  ) {
    return {
      recoverable: false,
      suggestedAction:
        'Credentials need to be configured in n8n. Please set up the required credentials in your n8n instance.',
    };
  }

  // These errors can potentially be fixed by the agent
  if (
    lowerMessage.includes('required') ||
    lowerMessage.includes('missing') ||
    lowerMessage.includes('parameter')
  ) {
    return {
      recoverable: true,
      suggestedAction: 'Add the missing required parameter using update_node_parameters.',
    };
  }

  if (lowerMessage.includes('invalid') || lowerMessage.includes('unknown node')) {
    return {
      recoverable: true,
      suggestedAction:
        'Check the node type or parameter value. Use list_available_nodes to see valid options.',
    };
  }

  if (lowerMessage.includes('connection') || lowerMessage.includes('not found')) {
    return {
      recoverable: true,
      suggestedAction: 'Check node names and ensure they exist before connecting.',
    };
  }

  // Default: try to recover
  return {
    recoverable: true,
    suggestedAction: 'Review the error message and fix the issue.',
  };
}

/**
 * Build retry prompt for the agent
 */
function buildRetryPrompt(
  errorMessage: string,
  analysis: { recoverable: boolean; suggestedAction?: string }
): string {
  return `
The workflow validation failed with the following error:
${errorMessage}

${analysis.suggestedAction ? `Suggested action: ${analysis.suggestedAction}` : ''}

Please analyze the error and fix the workflow. You may need to:
1. Update node parameters using update_node_parameters
2. Remove and re-add nodes if the type is wrong
3. Fix connections between nodes

After making corrections, call get_current_workflow to verify the fix.
`;
}

export async function buildWorkflow(
  userPrompt: string,
  options: BuildOptions = {}
): Promise<BuildResult> {
  const { verbose = false, model, continueFrom } = options;

  // Initialize n8n client
  initializeN8nClient();

  // Resolve model: CLI option > env variable > default (haiku)
  const modelInput = model || env.CLAUDE_MODEL;
  const modelId = resolveModelId(modelInput);

  if (verbose) {
    console.error(`Using model: ${modelId}`);
    if (isN8nApiAvailable()) {
      console.error('n8n API: connected');
    } else {
      console.error('n8n API: not configured (local validation only)');
    }
  }

  const conversationLog: string[] = continueFrom ? [...continueFrom] : [];

  // Reset workflow state for new build (unless continuing)
  if (!continueFrom) {
    workflowState.reset();
  }

  // Initialize Anthropic client
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });

  const systemPrompt = getSystemPrompt();
  const tools = getToolDefinitions();

  // Initialize messages
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: userPrompt,
    },
  ];

  let validationAttempts = 0;
  const maxRetries = env.MAX_VALIDATION_RETRIES;

  try {
    let turnCount = 0;

    while (turnCount < MAX_TURNS) {
      turnCount++;

      emitProgress(
        options,
        {
          type: 'TURN_START',
          turn: turnCount,
          message: 'Thinking...',
        },
        verbose
      );

      // Call Claude API
      const response = await client.messages.create({
        model: modelId,
        max_tokens: 4096,
        system: systemPrompt,
        tools: tools as Anthropic.Tool[],
        messages,
      });

      // Process response content
      const assistantContent: Anthropic.ContentBlock[] = [];
      let hasToolUse = false;

      for (const block of response.content) {
        if (block.type === 'text') {
          conversationLog.push(`Assistant: ${block.text}`);
          assistantContent.push(block);

          if (verbose && block.text.trim()) {
            console.error(`Assistant: ${block.text}`);
          }
        } else if (block.type === 'tool_use') {
          hasToolUse = true;
          assistantContent.push(block);

          emitProgress(
            options,
            {
              type: 'TOOL_CALL',
              toolName: block.name,
              message: JSON.stringify(block.input),
            },
            verbose
          );
          conversationLog.push(`Tool: ${block.name}(${JSON.stringify(block.input)})`);
        }
      }

      // Add assistant message to history
      messages.push({
        role: 'assistant',
        content: assistantContent,
      });

      // If no tool use, we're done
      if (!hasToolUse || response.stop_reason === 'end_turn') {
        // Check if we have a workflow
        const nodes = workflowState.getNodes();
        if (nodes.length > 0) {
          const workflow = workflowState.toN8nWorkflow('Generated Workflow');

          emitProgress(
            options,
            {
              type: 'VALIDATION',
              message: 'Validating workflow...',
            },
            verbose
          );

          const validation = validateWorkflow(workflow);

          if (!validation.valid) {
            validationAttempts++;
            const errorMsg = validation.errors.join('\n');
            const analysis = analyzeValidationError(errorMsg);

            if (analysis.recoverable && validationAttempts < maxRetries) {
              emitProgress(
                options,
                {
                  type: 'RETRY',
                  message: `Retry ${validationAttempts}/${maxRetries}: ${errorMsg}`,
                  details: { attempt: validationAttempts, maxRetries },
                },
                verbose
              );

              // Add retry prompt to continue the conversation
              messages.push({
                role: 'user',
                content: buildRetryPrompt(errorMsg, analysis),
              });
              continue;
            }

            return {
              success: false,
              error: `Generated workflow is invalid:\n${errorMsg}`,
              conversationLog,
              model: modelId,
              validationAttempts,
              requiresHumanInput: !analysis.recoverable,
              humanInputReason: analysis.suggestedAction,
            };
          }

          emitProgress(
            options,
            {
              type: 'SUCCESS',
              message: 'Workflow created successfully!',
            },
            verbose
          );

          return {
            success: true,
            workflow,
            validationWarnings: validation.warnings,
            conversationLog,
            model: modelId,
            validationAttempts,
          };
        } else {
          return {
            success: false,
            error: 'No workflow was created. Please try a more specific request.',
            conversationLog,
            model: modelId,
            validationAttempts,
          };
        }
      }

      // Execute tools and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          // Use async version to support n8n API tools
          const result = await executeToolAsync(block.name, block.input as Record<string, unknown>);

          const successIcon = result.success ? '✓' : '✗';
          emitProgress(
            options,
            {
              type: 'TOOL_RESULT',
              toolName: block.name,
              message: `${successIcon} ${result.message}`,
              details: result,
            },
            verbose
          );
          conversationLog.push(`Result: ${JSON.stringify(result)}`);

          // Format result for Claude
          let resultContent: string;
          if (result.data) {
            resultContent = JSON.stringify(result.data, null, 2);
          } else {
            resultContent = result.message;
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: resultContent,
          });
        }
      }

      // Add tool results to messages
      messages.push({
        role: 'user',
        content: toolResults,
      });
    }

    // Max turns reached
    const nodes = workflowState.getNodes();
    if (nodes.length > 0) {
      const workflow = workflowState.toN8nWorkflow('Generated Workflow');
      const validation = validateWorkflow(workflow);

      if (!validation.valid) {
        return {
          success: false,
          error: `Generated workflow is invalid:\n${validation.errors.join('\n')}`,
          conversationLog,
          model: modelId,
          validationAttempts,
          requiresHumanInput: true,
          humanInputReason:
            'Maximum turns reached. Please simplify your request or provide more specific instructions.',
        };
      }

      return {
        success: true,
        workflow,
        validationWarnings: validation.warnings,
        conversationLog,
        model: modelId,
        validationAttempts,
      };
    }

    return {
      success: false,
      error: 'Max turns reached without completing the workflow.',
      conversationLog,
      model: modelId,
      validationAttempts,
      requiresHumanInput: true,
      humanInputReason:
        'Unable to complete the workflow within the turn limit. Please try a simpler request.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    emitProgress(
      options,
      {
        type: 'ERROR',
        message: errorMessage,
      },
      verbose
    );

    return {
      success: false,
      error: errorMessage,
      conversationLog,
      model: modelId,
      validationAttempts,
    };
  }
}
