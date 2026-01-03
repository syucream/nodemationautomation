import { describe, it, expect } from 'vitest';
import { validateWorkflow } from './validator.js';
import type { N8nWorkflow } from './types.js';

describe('Workflow Validator', () => {
  const validWorkflow: N8nWorkflow = {
    name: 'Test Workflow',
    nodes: [
      {
        id: 'node_1',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [100, 100],
        parameters: { httpMethod: 'POST', path: 'test' },
      },
      {
        id: 'node_2',
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [350, 100],
        parameters: { method: 'GET', url: 'https://example.com' },
      },
    ],
    connections: {
      Webhook: {
        main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]],
      },
    },
    settings: { executionOrder: 'v1' },
  };

  describe('valid workflows', () => {
    it('should validate a correct workflow', () => {
      const result = validateWorkflow(validWorkflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass workflow with manual trigger', () => {
      const workflow: N8nWorkflow = {
        name: 'Manual Workflow',
        nodes: [
          {
            id: 'node_1',
            name: 'Manual Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [100, 100],
            parameters: {},
          },
        ],
        connections: {},
        settings: { executionOrder: 'v1' },
      };

      const result = validateWorkflow(workflow);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid workflows', () => {
    it('should reject workflow with no nodes', () => {
      const workflow: N8nWorkflow = {
        name: 'Empty',
        nodes: [],
        connections: {},
        settings: { executionOrder: 'v1' },
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('at least one node'))).toBe(true);
    });

    it('should reject workflow with empty name', () => {
      const workflow = {
        ...validWorkflow,
        name: '',
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    });

    it('should reject node with invalid type format', () => {
      const workflow: N8nWorkflow = {
        name: 'Invalid Type',
        nodes: [
          {
            id: 'node_1',
            name: 'Bad Node',
            type: 'invalid-type', // Should start with n8n-nodes-base.
            typeVersion: 1,
            position: [100, 100],
            parameters: {},
          },
        ],
        connections: {},
        settings: { executionOrder: 'v1' },
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('n8n-nodes-base'))).toBe(true);
    });

    it('should reject duplicate node names', () => {
      const workflow: N8nWorkflow = {
        name: 'Duplicate Names',
        nodes: [
          {
            id: 'node_1',
            name: 'Same Name',
            type: 'n8n-nodes-base.set',
            typeVersion: 3,
            position: [100, 100],
            parameters: {},
          },
          {
            id: 'node_2',
            name: 'Same Name', // Duplicate
            type: 'n8n-nodes-base.set',
            typeVersion: 3,
            position: [350, 100],
            parameters: {},
          },
        ],
        connections: {},
        settings: { executionOrder: 'v1' },
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Duplicate node name'))).toBe(true);
    });

    it('should reject connection to non-existent node', () => {
      const workflow: N8nWorkflow = {
        name: 'Bad Connection',
        nodes: [
          {
            id: 'node_1',
            name: 'Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [100, 100],
            parameters: {},
          },
        ],
        connections: {
          Trigger: {
            main: [[{ node: 'NonExistent', type: 'main', index: 0 }]],
          },
        },
        settings: { executionOrder: 'v1' },
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('NonExistent') && e.includes('does not exist'))
      ).toBe(true);
    });

    it('should reject connection from non-existent source', () => {
      const workflow: N8nWorkflow = {
        name: 'Bad Source',
        nodes: [
          {
            id: 'node_1',
            name: 'Action',
            type: 'n8n-nodes-base.set',
            typeVersion: 3,
            position: [100, 100],
            parameters: {},
          },
        ],
        connections: {
          NonExistent: {
            main: [[{ node: 'Action', type: 'main', index: 0 }]],
          },
        },
        settings: { executionOrder: 'v1' },
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('NonExistent') && e.includes('does not exist'))
      ).toBe(true);
    });
  });

  describe('warnings', () => {
    it('should warn about missing trigger node', () => {
      const workflow: N8nWorkflow = {
        name: 'No Trigger',
        nodes: [
          {
            id: 'node_1',
            name: 'Set',
            type: 'n8n-nodes-base.set',
            typeVersion: 3,
            position: [100, 100],
            parameters: {},
          },
        ],
        connections: {},
        settings: { executionOrder: 'v1' },
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true); // Still valid, just a warning
      expect(result.warnings.some((w) => w.includes('no trigger'))).toBe(true);
    });

    it('should warn about orphan nodes', () => {
      const workflow: N8nWorkflow = {
        name: 'Orphan Node',
        nodes: [
          {
            id: 'node_1',
            name: 'Trigger',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 2,
            position: [100, 100],
            parameters: {},
          },
          {
            id: 'node_2',
            name: 'Orphan',
            type: 'n8n-nodes-base.set',
            typeVersion: 3,
            position: [350, 100],
            parameters: {},
          },
        ],
        connections: {}, // No connections, Orphan is not connected
        settings: { executionOrder: 'v1' },
      };

      const result = validateWorkflow(workflow);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('Orphan') && w.includes('no incoming'))).toBe(
        true
      );
    });
  });
});
