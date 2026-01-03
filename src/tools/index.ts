/**
 * MCP Tools for Workflow Building
 * These tools are used by the Claude Agent to build n8n workflows.
 */

import { z } from 'zod';
import { workflowState } from '../workflow/state.js';
import { createN8nApiClient, type N8nApiClient } from './n8n-api.js';
import { env } from '../config/env.js';

// Initialize n8n API client if credentials are available
let n8nClient: N8nApiClient | null = null;

export function initializeN8nClient(): void {
  n8nClient = createN8nApiClient(env.N8N_BASE_URL, env.N8N_API_KEY);
}

export function isN8nApiAvailable(): boolean {
  return n8nClient !== null;
}

// Tool result type
export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// Tool definitions with Zod schemas
export const toolSchemas = {
  add_node: z.object({
    type: z.string().describe("n8n node type (e.g., 'n8n-nodes-base.httpRequest')"),
    typeVersion: z.number().describe('Node version number'),
    name: z.string().describe('Unique display name for the node'),
    parameters: z.record(z.unknown()).optional().describe('Node parameters'),
  }),

  connect_nodes: z.object({
    sourceNode: z.string().describe('Name of the source node'),
    targetNode: z.string().describe('Name of the target node'),
    sourceOutput: z.number().default(0).describe('Source output index (default: 0)'),
    targetInput: z.number().default(0).describe('Target input index (default: 0)'),
  }),

  get_current_workflow: z.object({
    name: z.string().describe('Name for the workflow'),
  }),

  update_node_parameters: z.object({
    nodeName: z.string().describe('Name of the node to update'),
    parameters: z.record(z.unknown()).describe('Parameters to update'),
  }),

  validate_workflow_with_n8n: z.object({
    workflowName: z.string().describe('Workflow name for validation'),
  }),

  create_workflow_in_n8n: z.object({
    workflowName: z.string().describe('Name for the workflow in n8n'),
  }),
};

// Tool implementations
export const toolImplementations = {
  add_node(args: z.infer<typeof toolSchemas.add_node>): ToolResult {
    try {
      // No node type validation - trust Claude's knowledge of n8n nodes
      // If the node type is wrong, n8n API validation will catch it
      const node = workflowState.addNode({
        type: args.type,
        typeVersion: args.typeVersion,
        name: args.name,
        parameters: args.parameters,
      });

      return {
        success: true,
        message: `Added node "${args.name}" (${args.type}) with ID: ${node.id}`,
        data: node,
      };
    } catch (error) {
      return {
        success: false,
        message: `Error adding node: ${(error as Error).message}`,
      };
    }
  },

  connect_nodes(args: z.infer<typeof toolSchemas.connect_nodes>): ToolResult {
    try {
      workflowState.connectNodes({
        sourceNode: args.sourceNode,
        targetNode: args.targetNode,
        sourceOutput: args.sourceOutput,
        targetInput: args.targetInput,
      });

      return {
        success: true,
        message: `Connected "${args.sourceNode}" -> "${args.targetNode}"`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Error connecting nodes: ${(error as Error).message}`,
      };
    }
  },

  get_current_workflow(args: z.infer<typeof toolSchemas.get_current_workflow>): ToolResult {
    try {
      const workflow = workflowState.toN8nWorkflow(args.name);
      return {
        success: true,
        message: 'Current workflow state:',
        data: workflow,
      };
    } catch (error) {
      return {
        success: false,
        message: `Error getting workflow: ${(error as Error).message}`,
      };
    }
  },

  update_node_parameters(args: z.infer<typeof toolSchemas.update_node_parameters>): ToolResult {
    try {
      workflowState.updateNodeParameters(args.nodeName, args.parameters);
      return {
        success: true,
        message: `Updated parameters for node "${args.nodeName}"`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Error updating parameters: ${(error as Error).message}`,
      };
    }
  },

  async validate_workflow_with_n8n(
    args: z.infer<typeof toolSchemas.validate_workflow_with_n8n>
  ): Promise<ToolResult> {
    if (!n8nClient) {
      return {
        success: false,
        message:
          'n8n API is not configured. Set N8N_API_KEY environment variable to enable n8n validation.',
      };
    }

    try {
      const workflow = workflowState.toN8nWorkflow(args.workflowName);
      const result = await n8nClient.validateByCreation(workflow);

      if (result.valid) {
        return {
          success: true,
          message: 'Workflow validated successfully against n8n API.',
          data: { validatedAt: new Date().toISOString() },
        };
      } else {
        return {
          success: false,
          message: `n8n validation failed: ${result.error?.message || 'Unknown error'}`,
          data: {
            errorType: result.error?.errorType,
            recoverable: result.error?.recoverable,
            details: result.error?.details,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error validating workflow: ${(error as Error).message}`,
      };
    }
  },

  async create_workflow_in_n8n(
    args: z.infer<typeof toolSchemas.create_workflow_in_n8n>
  ): Promise<ToolResult> {
    if (!n8nClient) {
      return {
        success: false,
        message:
          'n8n API is not configured. Set N8N_API_KEY environment variable to enable n8n integration.',
      };
    }

    try {
      const workflow = workflowState.toN8nWorkflow(args.workflowName);
      const response = await n8nClient.createWorkflow(workflow);

      return {
        success: true,
        message: `Workflow created successfully in n8n.`,
        data: {
          id: response.id,
          name: response.name,
          url: `${env.N8N_BASE_URL}/workflow/${response.id}`,
          active: response.active,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Error creating workflow in n8n: ${errorMessage}`,
      };
    }
  },
};

// Async tool names (tools that return Promise<ToolResult>)
const asyncTools = new Set(['validate_workflow_with_n8n', 'create_workflow_in_n8n']);

// Execute a tool by name (sync version for backward compatibility)
export function executeTool(toolName: string, args: Record<string, unknown>): ToolResult {
  const schema = toolSchemas[toolName as keyof typeof toolSchemas];
  if (!schema) {
    return {
      success: false,
      message: `Unknown tool: ${toolName}`,
    };
  }

  // Check if this is an async tool
  if (asyncTools.has(toolName)) {
    return {
      success: false,
      message: `Tool ${toolName} is async. Use executeToolAsync instead.`,
    };
  }

  // Validate arguments
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return {
      success: false,
      message: `Invalid arguments: ${parsed.error.message}`,
    };
  }

  const implementation = toolImplementations[toolName as keyof typeof toolImplementations];
  return implementation(parsed.data as never) as ToolResult;
}

// Execute a tool by name (async version)
export async function executeToolAsync(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const schema = toolSchemas[toolName as keyof typeof toolSchemas];
  if (!schema) {
    return {
      success: false,
      message: `Unknown tool: ${toolName}`,
    };
  }

  // Validate arguments
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return {
      success: false,
      message: `Invalid arguments: ${parsed.error.message}`,
    };
  }

  const implementation = toolImplementations[toolName as keyof typeof toolImplementations];
  const result = implementation(parsed.data as never);

  // Handle both sync and async tools
  if (result instanceof Promise) {
    return result;
  }
  return result as ToolResult;
}

// Get tool definitions for Claude API
export function getToolDefinitions() {
  return [
    {
      name: 'add_node',
      description:
        'Add a node to the workflow. Use this to add triggers, actions, or control nodes.',
      input_schema: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            description: "n8n node type (e.g., 'n8n-nodes-base.httpRequest')",
          },
          typeVersion: {
            type: 'number',
            description: 'Node version number',
          },
          name: {
            type: 'string',
            description: 'Unique display name for the node',
          },
          parameters: {
            type: 'object',
            description: 'Node parameters',
          },
        },
        required: ['type', 'typeVersion', 'name'],
      },
    },
    {
      name: 'connect_nodes',
      description: 'Connect two nodes in the workflow. Data flows from source to target.',
      input_schema: {
        type: 'object' as const,
        properties: {
          sourceNode: {
            type: 'string',
            description: 'Name of the source node',
          },
          targetNode: {
            type: 'string',
            description: 'Name of the target node',
          },
          sourceOutput: {
            type: 'number',
            description: 'Source output index (default: 0)',
          },
          targetInput: {
            type: 'number',
            description: 'Target input index (default: 0)',
          },
        },
        required: ['sourceNode', 'targetNode'],
      },
    },
    {
      name: 'get_current_workflow',
      description:
        'Get the current workflow state as JSON. Use this to verify the workflow before finalizing.',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string',
            description: 'Name for the workflow',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_node_parameters',
      description: 'Update parameters for an existing node.',
      input_schema: {
        type: 'object' as const,
        properties: {
          nodeName: {
            type: 'string',
            description: 'Name of the node to update',
          },
          parameters: {
            type: 'object',
            description: 'Parameters to update',
          },
        },
        required: ['nodeName', 'parameters'],
      },
    },
    {
      name: 'validate_workflow_with_n8n',
      description:
        'Validate the current workflow by creating a temporary workflow in n8n API, ' +
        'then immediately deleting it. Returns validation success or detailed error ' +
        'message from n8n. Use this to verify the workflow is valid before finalizing. ' +
        'Only available if N8N_API_KEY is configured.',
      input_schema: {
        type: 'object' as const,
        properties: {
          workflowName: {
            type: 'string',
            description: 'Name for the temporary validation workflow',
          },
        },
        required: ['workflowName'],
      },
    },
    {
      name: 'create_workflow_in_n8n',
      description:
        'Create the workflow in the n8n instance permanently. ' +
        'This should be called only after validation passes. ' +
        'Returns the workflow ID and URL for access. ' +
        'Only available if N8N_API_KEY is configured.',
      input_schema: {
        type: 'object' as const,
        properties: {
          workflowName: {
            type: 'string',
            description: 'Name for the workflow in n8n',
          },
        },
        required: ['workflowName'],
      },
    },
  ];
}
