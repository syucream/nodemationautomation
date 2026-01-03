/**
 * n8n Workflow JSON Validator
 * Validates that generated workflows conform to n8n's expected format.
 */

import { z } from 'zod';
import type { N8nWorkflow } from './types.js';

// n8n Node Schema
const n8nNodeSchema = z.object({
  id: z.string().min(1, 'Node ID is required'),
  name: z.string().min(1, 'Node name is required'),
  type: z
    .string()
    .min(1)
    .regex(
      /^(n8n-nodes-base\.|@n8n\/n8n-nodes-langchain\.)/,
      "Node type must start with 'n8n-nodes-base.' or '@n8n/n8n-nodes-langchain.'"
    ),
  typeVersion: z.number().int().positive('typeVersion must be a positive integer'),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()),
  credentials: z
    .record(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .optional(),
});

// n8n Connection Target Schema
const n8nConnectionTargetSchema = z.object({
  node: z.string().min(1, 'Target node name is required'),
  type: z.enum(['main', 'ai_tool', 'ai_languageModel', 'ai_memory']),
  index: z.number().int().min(0),
});

// n8n Connections Schema
const n8nConnectionsSchema = z.record(
  z.object({
    main: z.array(z.array(n8nConnectionTargetSchema)),
  })
);

// n8n Workflow Schema
const n8nWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required'),
  nodes: z.array(n8nNodeSchema).min(1, 'Workflow must have at least one node'),
  connections: n8nConnectionsSchema,
  settings: z.object({
    executionOrder: z.literal('v1'),
  }),
});

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a workflow object against n8n schema
 */
export function validateWorkflow(workflow: N8nWorkflow): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Schema validation
  const schemaResult = n8nWorkflowSchema.safeParse(workflow);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
    return { valid: false, errors, warnings };
  }

  // Semantic validation
  const nodeNames = new Set(workflow.nodes.map((n) => n.name));
  const nodeIds = new Set(workflow.nodes.map((n) => n.id));

  // Check for duplicate node names
  if (nodeNames.size !== workflow.nodes.length) {
    const seen = new Set<string>();
    for (const node of workflow.nodes) {
      if (seen.has(node.name)) {
        errors.push(`Duplicate node name: "${node.name}"`);
      }
      seen.add(node.name);
    }
  }

  // Check for duplicate node IDs
  if (nodeIds.size !== workflow.nodes.length) {
    errors.push('Duplicate node IDs detected');
  }

  // Validate connections reference existing nodes
  for (const [sourceName, connections] of Object.entries(workflow.connections)) {
    if (!nodeNames.has(sourceName)) {
      errors.push(`Connection source "${sourceName}" does not exist as a node`);
    }

    for (const outputConnections of connections.main) {
      for (const conn of outputConnections) {
        if (!nodeNames.has(conn.node)) {
          errors.push(
            `Connection target "${conn.node}" (from "${sourceName}") does not exist as a node`
          );
        }
      }
    }
  }

  // Check for trigger node (any node type containing "trigger" or "Trigger", or webhook/cron)
  const isTriggerNode = (type: string): boolean => {
    const lowerType = type.toLowerCase();
    return (
      lowerType.includes('trigger') || lowerType.includes('webhook') || lowerType.endsWith('.cron')
    );
  };
  const hasTrigger = workflow.nodes.some((n) => isTriggerNode(n.type));
  if (!hasTrigger) {
    warnings.push('Workflow has no trigger node. It can only be executed manually via API.');
  }

  // Check for orphan nodes (nodes with no connections to them, except triggers)
  const connectedNodes = new Set<string>();
  for (const connections of Object.values(workflow.connections)) {
    for (const outputConnections of connections.main) {
      for (const conn of outputConnections) {
        connectedNodes.add(conn.node);
      }
    }
  }

  for (const node of workflow.nodes) {
    const isTrigger = isTriggerNode(node.type);
    const isConnected = connectedNodes.has(node.name);

    if (!isTrigger && !isConnected && workflow.nodes.length > 1) {
      warnings.push(`Node "${node.name}" has no incoming connections`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate and return a cleaned workflow or throw
 */
export function validateAndClean(workflow: N8nWorkflow): N8nWorkflow {
  const result = validateWorkflow(workflow);

  if (!result.valid) {
    throw new Error(`Invalid workflow:\n${result.errors.join('\n')}`);
  }

  // Log warnings
  if (result.warnings.length > 0) {
    console.error('Workflow warnings:');
    for (const warning of result.warnings) {
      console.error(`  - ${warning}`);
    }
  }

  return workflow;
}
