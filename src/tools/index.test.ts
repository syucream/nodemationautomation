import { describe, it, expect, beforeEach } from 'vitest';
import { executeTool, getToolDefinitions, toolImplementations } from './index.js';
import { workflowState } from '../workflow/state.js';

describe('Tools', () => {
  beforeEach(() => {
    workflowState.reset();
  });

  describe('getToolDefinitions', () => {
    it('should return all tool definitions', () => {
      const tools = getToolDefinitions();

      expect(tools.length).toBe(6);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('add_node');
      expect(toolNames).toContain('connect_nodes');
      expect(toolNames).toContain('get_current_workflow');
      expect(toolNames).toContain('update_node_parameters');
      expect(toolNames).toContain('validate_workflow_with_n8n');
      expect(toolNames).toContain('create_workflow_in_n8n');
    });

    it('should have valid tool schema format', () => {
      const tools = getToolDefinitions();

      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.input_schema).toBeDefined();
        expect(tool.input_schema.type).toBe('object');
        expect(tool.input_schema.properties).toBeDefined();
        expect(Array.isArray(tool.input_schema.required)).toBe(true);
      }
    });
  });

  describe('add_node tool', () => {
    it('should add a valid node', () => {
      const result = toolImplementations.add_node({
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        name: 'My HTTP Request',
        parameters: { method: 'GET', url: 'https://example.com' },
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('My HTTP Request');
      expect(result.data).toBeDefined();
    });

    it('should accept any node type (validated by n8n API)', () => {
      const result = toolImplementations.add_node({
        type: 'n8n-nodes-base.unknownNode',
        typeVersion: 1,
        name: 'Unknown',
      });

      // No longer reject unknown types - trust Claude and n8n API validation
      expect(result.success).toBe(true);
    });

    it('should reject duplicate node names', () => {
      toolImplementations.add_node({
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        name: 'My Node',
      });

      const result = toolImplementations.add_node({
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        name: 'My Node',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists');
    });
  });

  describe('connect_nodes tool', () => {
    beforeEach(() => {
      toolImplementations.add_node({
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        name: 'Trigger',
      });
      toolImplementations.add_node({
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        name: 'Request',
      });
    });

    it('should connect two nodes', () => {
      const result = toolImplementations.connect_nodes({
        sourceNode: 'Trigger',
        targetNode: 'Request',
        sourceOutput: 0,
        targetInput: 0,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Trigger');
      expect(result.message).toContain('Request');
    });

    it('should reject connection to non-existent node', () => {
      const result = toolImplementations.connect_nodes({
        sourceNode: 'Trigger',
        targetNode: 'NonExistent',
        sourceOutput: 0,
        targetInput: 0,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('get_current_workflow tool', () => {
    it('should return current workflow state', () => {
      toolImplementations.add_node({
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        name: 'Webhook',
        parameters: { httpMethod: 'POST', path: 'test' },
      });

      const result = toolImplementations.get_current_workflow({
        name: 'Test Workflow',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const workflow = result.data as {
        name: string;
        nodes: Array<{ name: string }>;
      };
      expect(workflow.name).toBe('Test Workflow');
      expect(workflow.nodes).toHaveLength(1);
      expect(workflow.nodes[0].name).toBe('Webhook');
    });

    it('should return empty workflow when no nodes', () => {
      const result = toolImplementations.get_current_workflow({
        name: 'Empty',
      });

      expect(result.success).toBe(true);
      const workflow = result.data as { nodes: unknown[] };
      expect(workflow.nodes).toHaveLength(0);
    });
  });

  describe('update_node_parameters tool', () => {
    it('should update node parameters', () => {
      toolImplementations.add_node({
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        name: 'Request',
        parameters: { method: 'GET' },
      });

      const result = toolImplementations.update_node_parameters({
        nodeName: 'Request',
        parameters: { url: 'https://api.example.com' },
      });

      expect(result.success).toBe(true);

      // Verify update
      const workflow = workflowState.toN8nWorkflow('Test');
      const node = workflow.nodes.find((n) => n.name === 'Request');
      expect(node?.parameters).toEqual({
        method: 'GET',
        url: 'https://api.example.com',
      });
    });

    it('should reject update for non-existent node', () => {
      const result = toolImplementations.update_node_parameters({
        nodeName: 'NonExistent',
        parameters: { foo: 'bar' },
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('executeTool', () => {
    it('should execute valid tool with valid args', () => {
      const result = executeTool('add_node', {
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        name: 'Trigger',
      });

      expect(result.success).toBe(true);
    });

    it('should reject unknown tool', () => {
      const result = executeTool('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown tool');
    });

    it('should validate arguments', () => {
      const result = executeTool('add_node', {
        // Missing required fields
        name: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid arguments');
    });
  });

  describe('End-to-end workflow building', () => {
    it('should build a complete workflow using tools', () => {
      // Step 1: Add trigger
      const trigger = executeTool('add_node', {
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        name: 'Webhook Trigger',
        parameters: { httpMethod: 'POST', path: 'notify' },
      });
      expect(trigger.success).toBe(true);

      // Step 2: Add action
      const action = executeTool('add_node', {
        type: 'n8n-nodes-base.slack',
        typeVersion: 2,
        name: 'Send Slack',
        parameters: {
          resource: 'message',
          operation: 'post',
          channel: '#general',
          text: 'New webhook received!',
        },
      });
      expect(action.success).toBe(true);

      // Step 3: Connect nodes
      const connect = executeTool('connect_nodes', {
        sourceNode: 'Webhook Trigger',
        targetNode: 'Send Slack',
      });
      expect(connect.success).toBe(true);

      // Step 4: Get workflow
      const workflow = executeTool('get_current_workflow', {
        name: 'Webhook to Slack',
      });
      expect(workflow.success).toBe(true);

      const data = workflow.data as {
        name: string;
        nodes: Array<{ name: string; type: string }>;
        connections: Record<string, unknown>;
      };

      expect(data.name).toBe('Webhook to Slack');
      expect(data.nodes).toHaveLength(2);
      expect(data.connections['Webhook Trigger']).toBeDefined();
    });
  });
});
