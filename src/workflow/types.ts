/**
 * n8n Workflow Type Definitions
 * These types ensure compatibility with n8n's workflow JSON format.
 */

export interface N8nCredentialReference {
  id: string;
  name: string;
}

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, N8nCredentialReference>;
}

export type N8nConnectionType = 'main' | 'ai_tool' | 'ai_languageModel' | 'ai_memory';

export interface N8nConnectionTarget {
  node: string;
  type: N8nConnectionType;
  index: number;
}

export interface N8nNodeConnections {
  main: N8nConnectionTarget[][];
}

export interface N8nConnections {
  [sourceNodeName: string]: N8nNodeConnections;
}

export interface N8nWorkflowSettings {
  executionOrder: 'v1';
}

export interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: N8nConnections;
  settings: N8nWorkflowSettings;
}

// Input types for building workflows
export interface AddNodeInput {
  type: string;
  typeVersion: number;
  name: string;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, N8nCredentialReference>;
}

export interface ConnectNodesInput {
  sourceNode: string;
  targetNode: string;
  sourceOutput?: number;
  targetInput?: number;
  connectionType?: N8nConnectionType;
}
