import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowStateManager } from './state.js';

describe('WorkflowStateManager', () => {
  let manager: WorkflowStateManager;

  beforeEach(() => {
    manager = new WorkflowStateManager();
  });

  describe('addNode', () => {
    it('should add a node with correct properties', () => {
      const node = manager.addNode({
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        name: 'HTTP Request',
        parameters: { method: 'GET', url: 'https://example.com' },
      });

      expect(node.id).toBe('node_1');
      expect(node.name).toBe('HTTP Request');
      expect(node.type).toBe('n8n-nodes-base.httpRequest');
      expect(node.typeVersion).toBe(4);
      expect(node.parameters).toEqual({
        method: 'GET',
        url: 'https://example.com',
      });
      expect(node.position).toEqual([100, 100]);
    });

    it('should auto-increment node IDs', () => {
      const node1 = manager.addNode({
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        name: 'Trigger',
      });
      const node2 = manager.addNode({
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        name: 'Request',
      });

      expect(node1.id).toBe('node_1');
      expect(node2.id).toBe('node_2');
    });

    it('should calculate positions in grid layout', () => {
      const nodes = [];
      for (let i = 0; i < 5; i++) {
        nodes.push(
          manager.addNode({
            type: 'n8n-nodes-base.set',
            typeVersion: 3,
            name: `Node ${i}`,
          })
        );
      }

      // First row: positions at x = 100, 350, 600, 850
      expect(nodes[0].position).toEqual([100, 100]);
      expect(nodes[1].position).toEqual([350, 100]);
      expect(nodes[2].position).toEqual([600, 100]);
      expect(nodes[3].position).toEqual([850, 100]);
      // Second row starts
      expect(nodes[4].position).toEqual([100, 250]);
    });

    it('should throw error for duplicate node names', () => {
      manager.addNode({
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        name: 'My Node',
      });

      expect(() =>
        manager.addNode({
          type: 'n8n-nodes-base.set',
          typeVersion: 3,
          name: 'My Node',
        })
      ).toThrow('Node with name "My Node" already exists');
    });
  });

  describe('removeNode', () => {
    it('should remove a node by name', () => {
      manager.addNode({
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        name: 'To Remove',
      });

      expect(manager.getNode('To Remove')).toBeDefined();
      expect(manager.removeNode('To Remove')).toBe(true);
      expect(manager.getNode('To Remove')).toBeUndefined();
    });

    it('should return false for non-existent node', () => {
      expect(manager.removeNode('Non Existent')).toBe(false);
    });

    it('should also remove connections to/from the removed node', () => {
      manager.addNode({
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        name: 'Trigger',
      });
      manager.addNode({
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        name: 'Middle',
      });
      manager.addNode({
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        name: 'Request',
      });

      manager.connectNodes({ sourceNode: 'Trigger', targetNode: 'Middle' });
      manager.connectNodes({ sourceNode: 'Middle', targetNode: 'Request' });

      manager.removeNode('Middle');

      const workflow = manager.toN8nWorkflow('Test');
      expect(workflow.connections['Trigger']).toBeUndefined();
      expect(workflow.connections['Middle']).toBeUndefined();
    });
  });

  describe('connectNodes', () => {
    beforeEach(() => {
      manager.addNode({
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        name: 'Trigger',
      });
      manager.addNode({
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        name: 'Request',
      });
    });

    it('should connect two nodes', () => {
      manager.connectNodes({
        sourceNode: 'Trigger',
        targetNode: 'Request',
      });

      const workflow = manager.toN8nWorkflow('Test');
      expect(workflow.connections['Trigger']).toBeDefined();
      expect(workflow.connections['Trigger'].main[0]).toEqual([
        { node: 'Request', type: 'main', index: 0 },
      ]);
    });

    it('should throw error for non-existent source node', () => {
      expect(() =>
        manager.connectNodes({
          sourceNode: 'NonExistent',
          targetNode: 'Request',
        })
      ).toThrow('Source node "NonExistent" not found');
    });

    it('should throw error for non-existent target node', () => {
      expect(() =>
        manager.connectNodes({
          sourceNode: 'Trigger',
          targetNode: 'NonExistent',
        })
      ).toThrow('Target node "NonExistent" not found');
    });

    it('should throw error for duplicate connections', () => {
      manager.connectNodes({
        sourceNode: 'Trigger',
        targetNode: 'Request',
      });

      expect(() =>
        manager.connectNodes({
          sourceNode: 'Trigger',
          targetNode: 'Request',
        })
      ).toThrow('Connection from "Trigger" to "Request" already exists');
    });

    it('should support multiple outputs from same node', () => {
      manager.addNode({
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        name: 'IF',
      });
      manager.addNode({
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        name: 'True Branch',
      });
      manager.addNode({
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        name: 'False Branch',
      });

      manager.connectNodes({
        sourceNode: 'IF',
        targetNode: 'True Branch',
        sourceOutput: 0,
      });
      manager.connectNodes({
        sourceNode: 'IF',
        targetNode: 'False Branch',
        sourceOutput: 1,
      });

      const workflow = manager.toN8nWorkflow('Test');
      expect(workflow.connections['IF'].main[0]).toEqual([
        { node: 'True Branch', type: 'main', index: 0 },
      ]);
      expect(workflow.connections['IF'].main[1]).toEqual([
        { node: 'False Branch', type: 'main', index: 0 },
      ]);
    });
  });

  describe('updateNodeParameters', () => {
    it('should update node parameters', () => {
      manager.addNode({
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        name: 'Request',
        parameters: { method: 'GET' },
      });

      manager.updateNodeParameters('Request', {
        url: 'https://api.example.com',
      });

      const node = manager.getNode('Request');
      expect(node?.parameters).toEqual({
        method: 'GET',
        url: 'https://api.example.com',
      });
    });

    it('should throw error for non-existent node', () => {
      expect(() => manager.updateNodeParameters('NonExistent', { foo: 'bar' })).toThrow(
        'Node "NonExistent" not found'
      );
    });
  });

  describe('toN8nWorkflow', () => {
    it('should generate valid n8n workflow JSON', () => {
      manager.addNode({
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        name: 'Webhook',
        parameters: { httpMethod: 'POST', path: 'test' },
      });
      manager.addNode({
        type: 'n8n-nodes-base.slack',
        typeVersion: 2,
        name: 'Slack',
        parameters: { channel: '#general', text: 'Hello' },
      });
      manager.connectNodes({
        sourceNode: 'Webhook',
        targetNode: 'Slack',
      });

      const workflow = manager.toN8nWorkflow('My Workflow');

      expect(workflow.name).toBe('My Workflow');
      expect(workflow.nodes).toHaveLength(2);
      expect(workflow.settings).toEqual({ executionOrder: 'v1' });

      // Check nodes
      const webhookNode = workflow.nodes.find((n) => n.name === 'Webhook');
      expect(webhookNode).toBeDefined();
      expect(webhookNode?.type).toBe('n8n-nodes-base.webhook');

      // Check connections
      expect(workflow.connections['Webhook'].main[0]).toEqual([
        { node: 'Slack', type: 'main', index: 0 },
      ]);
    });

    it('should return empty workflow when no nodes', () => {
      const workflow = manager.toN8nWorkflow('Empty');

      expect(workflow.name).toBe('Empty');
      expect(workflow.nodes).toHaveLength(0);
      expect(workflow.connections).toEqual({});
    });
  });

  describe('reset', () => {
    it('should clear all nodes and connections', () => {
      manager.addNode({
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        name: 'Node 1',
      });
      manager.addNode({
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        name: 'Node 2',
      });
      manager.connectNodes({ sourceNode: 'Node 1', targetNode: 'Node 2' });

      manager.reset();

      expect(manager.getNodes()).toHaveLength(0);
      const workflow = manager.toN8nWorkflow('Test');
      expect(workflow.connections).toEqual({});
    });

    it('should reset node counter', () => {
      manager.addNode({
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        name: 'Node 1',
      });

      manager.reset();

      const node = manager.addNode({
        type: 'n8n-nodes-base.set',
        typeVersion: 3,
        name: 'New Node',
      });
      expect(node.id).toBe('node_1');
    });
  });

  describe('getSummary', () => {
    it('should return summary of current state', () => {
      manager.addNode({
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        name: 'Trigger',
      });
      manager.addNode({
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        name: 'Request',
      });
      manager.connectNodes({ sourceNode: 'Trigger', targetNode: 'Request' });

      const summary = manager.getSummary();

      expect(summary).toContain('Nodes (2):');
      expect(summary).toContain('Trigger (n8n-nodes-base.manualTrigger)');
      expect(summary).toContain('Request (n8n-nodes-base.httpRequest)');
      expect(summary).toContain('Connections (1):');
      expect(summary).toContain('Trigger -> Request');
    });
  });
});
