/**
 * Workflow State Manager
 * Manages the in-memory state of a workflow being built.
 */

import type {
  N8nNode,
  N8nWorkflow,
  N8nConnections,
  N8nConnectionType,
  AddNodeInput,
  ConnectNodesInput,
} from './types.js';

interface InternalConnection {
  target: string;
  sourceOutput: number;
  targetInput: number;
  connectionType: N8nConnectionType;
}

export class WorkflowStateManager {
  private nodes: Map<string, N8nNode> = new Map();
  private connections: Map<string, InternalConnection[]> = new Map();
  private nodeCounter = 0;

  /**
   * Add a node to the workflow
   */
  addNode(input: AddNodeInput): N8nNode {
    // Check for duplicate names
    if (this.nodes.has(input.name)) {
      throw new Error(`Node with name "${input.name}" already exists`);
    }

    const id = `node_${++this.nodeCounter}`;

    // Calculate position (simple grid layout)
    const nodeIndex = this.nodes.size;
    const position: [number, number] = [
      100 + (nodeIndex % 4) * 250,
      100 + Math.floor(nodeIndex / 4) * 150,
    ];

    const node: N8nNode = {
      id,
      name: input.name,
      type: input.type,
      typeVersion: input.typeVersion,
      position,
      parameters: input.parameters || {},
    };

    if (input.credentials) {
      node.credentials = input.credentials;
    }

    this.nodes.set(input.name, node);
    return node;
  }

  /**
   * Remove a node from the workflow
   */
  removeNode(name: string): boolean {
    if (!this.nodes.has(name)) {
      return false;
    }

    this.nodes.delete(name);

    // Remove connections from this node
    this.connections.delete(name);

    // Remove connections to this node
    for (const [source, conns] of this.connections) {
      const filtered = conns.filter((c) => c.target !== name);
      if (filtered.length === 0) {
        this.connections.delete(source);
      } else {
        this.connections.set(source, filtered);
      }
    }

    return true;
  }

  /**
   * Connect two nodes
   */
  connectNodes(input: ConnectNodesInput): void {
    const sourceNode = this.nodes.get(input.sourceNode);
    const targetNode = this.nodes.get(input.targetNode);

    if (!sourceNode) {
      throw new Error(`Source node "${input.sourceNode}" not found`);
    }
    if (!targetNode) {
      throw new Error(`Target node "${input.targetNode}" not found`);
    }

    const existing = this.connections.get(input.sourceNode) || [];

    // Check for duplicate connection
    const duplicate = existing.find(
      (c) =>
        c.target === input.targetNode &&
        c.sourceOutput === (input.sourceOutput || 0) &&
        c.targetInput === (input.targetInput || 0)
    );

    if (duplicate) {
      throw new Error(
        `Connection from "${input.sourceNode}" to "${input.targetNode}" already exists`
      );
    }

    existing.push({
      target: input.targetNode,
      sourceOutput: input.sourceOutput || 0,
      targetInput: input.targetInput || 0,
      connectionType: input.connectionType || 'main',
    });

    this.connections.set(input.sourceNode, existing);
  }

  /**
   * Update a node's parameters
   */
  updateNodeParameters(name: string, parameters: Record<string, unknown>): void {
    const node = this.nodes.get(name);
    if (!node) {
      throw new Error(`Node "${name}" not found`);
    }

    node.parameters = { ...node.parameters, ...parameters };
  }

  /**
   * Get a node by name
   */
  getNode(name: string): N8nNode | undefined {
    return this.nodes.get(name);
  }

  /**
   * Get all nodes
   */
  getNodes(): N8nNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Convert internal state to n8n workflow JSON format
   */
  toN8nWorkflow(name: string): N8nWorkflow {
    const connections: N8nConnections = {};

    for (const [source, conns] of this.connections) {
      // Group connections by source output
      const outputGroups = new Map<number, typeof conns>();
      for (const conn of conns) {
        const group = outputGroups.get(conn.sourceOutput) || [];
        group.push(conn);
        outputGroups.set(conn.sourceOutput, group);
      }

      // Build the main connection array
      const mainConnections: N8nWorkflow['connections'][string]['main'] = [];

      // Ensure array is properly sized for all output indices
      const maxOutput = Math.max(...outputGroups.keys());
      for (let i = 0; i <= maxOutput; i++) {
        const group = outputGroups.get(i) || [];
        mainConnections[i] = group.map((c) => ({
          node: c.target,
          type: c.connectionType,
          index: c.targetInput,
        }));
      }

      connections[source] = { main: mainConnections };
    }

    return {
      name,
      nodes: Array.from(this.nodes.values()),
      connections,
      settings: { executionOrder: 'v1' },
    };
  }

  /**
   * Reset the state for a new workflow
   */
  reset(): void {
    this.nodes.clear();
    this.connections.clear();
    this.nodeCounter = 0;
  }

  /**
   * Get a summary of the current workflow
   */
  getSummary(): string {
    const nodeList = Array.from(this.nodes.values())
      .map((n) => `- ${n.name} (${n.type})`)
      .join('\n');

    const connectionList: string[] = [];
    for (const [source, conns] of this.connections) {
      for (const conn of conns) {
        connectionList.push(`- ${source} -> ${conn.target}`);
      }
    }

    return `Nodes (${this.nodes.size}):\n${nodeList || '(none)'}\n\nConnections (${connectionList.length}):\n${connectionList.join('\n') || '(none)'}`;
  }
}

// Singleton instance for CLI usage
export const workflowState = new WorkflowStateManager();
