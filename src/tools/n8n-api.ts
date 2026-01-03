/**
 * n8n API Client
 * Provides methods to interact with n8n's REST API for workflow management.
 */

import type { N8nWorkflow } from '../workflow/types.js';

export interface N8nApiConfig {
  baseUrl: string;
  apiKey: string;
}

export interface N8nApiError {
  statusCode: number;
  message: string;
  errorType:
    | 'AUTHENTICATION'
    | 'VALIDATION'
    | 'NOT_FOUND'
    | 'RATE_LIMIT'
    | 'SERVER_ERROR'
    | 'NETWORK';
  recoverable: boolean;
  details?: unknown;
}

export interface CreateWorkflowResponse {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: N8nApiError;
}

/**
 * n8n API Client for workflow operations
 */
export class N8nApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: N8nApiConfig) {
    // Remove trailing slash from base URL
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  /**
   * Create a workflow in n8n
   */
  async createWorkflow(workflow: N8nWorkflow): Promise<CreateWorkflowResponse> {
    const response = await this.request('/api/v1/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    });

    if (!response.ok) {
      throw await this.parseError(response);
    }

    return response.json();
  }

  /**
   * Delete a workflow by ID
   */
  async deleteWorkflow(id: string): Promise<void> {
    const response = await this.request(`/api/v1/workflows/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw await this.parseError(response);
    }
  }

  /**
   * Validate a workflow by creating and immediately deleting it
   * This uses n8n's own validation logic
   */
  async validateByCreation(workflow: N8nWorkflow): Promise<ValidationResult> {
    try {
      // Try to create the workflow
      const created = await this.createWorkflow(workflow);

      // If successful, delete it immediately
      try {
        await this.deleteWorkflow(created.id);
      } catch (deleteError) {
        // Log but don't fail - the validation succeeded
        console.error(`Warning: Failed to delete temporary workflow ${created.id}:`, deleteError);
      }

      return { valid: true };
    } catch (error) {
      if (error instanceof Error && 'statusCode' in error) {
        return {
          valid: false,
          error: error as unknown as N8nApiError,
        };
      }

      // Network or unknown error
      return {
        valid: false,
        error: {
          statusCode: 0,
          message: error instanceof Error ? error.message : 'Unknown error',
          errorType: 'NETWORK',
          recoverable: true,
        },
      };
    }
  }

  /**
   * Check if the n8n API is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request('/api/v1/workflows?limit=1', {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Make an authenticated request to the n8n API
   */
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'X-N8N-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    try {
      return await fetch(url, {
        ...options,
        headers,
      });
    } catch (error) {
      // Convert fetch errors to our error format
      const networkError: N8nApiError = {
        statusCode: 0,
        message: `Network error: ${error instanceof Error ? error.message : 'Failed to connect to n8n'}`,
        errorType: 'NETWORK',
        recoverable: true,
      };
      throw networkError;
    }
  }

  /**
   * Parse an error response from n8n API
   */
  private async parseError(response: Response): Promise<N8nApiError> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    // Authentication error
    if (response.status === 401 || response.status === 403) {
      return {
        statusCode: response.status,
        message: 'n8n API authentication failed. Check N8N_API_KEY.',
        errorType: 'AUTHENTICATION',
        recoverable: false,
        details: body,
      };
    }

    // Validation error (400, 422)
    if (response.status === 400 || response.status === 422) {
      const message = this.extractValidationMessage(body);
      return {
        statusCode: response.status,
        message: `Workflow validation failed: ${message}`,
        errorType: 'VALIDATION',
        recoverable: this.isRecoverableValidationError(message),
        details: body,
      };
    }

    // Not found
    if (response.status === 404) {
      return {
        statusCode: 404,
        message: 'Workflow not found',
        errorType: 'NOT_FOUND',
        recoverable: false,
        details: body,
      };
    }

    // Rate limit
    if (response.status === 429) {
      return {
        statusCode: 429,
        message: 'Rate limit exceeded. Please wait before retrying.',
        errorType: 'RATE_LIMIT',
        recoverable: true,
        details: body,
      };
    }

    // Server error
    return {
      statusCode: response.status,
      message: `n8n server error: ${response.statusText}`,
      errorType: 'SERVER_ERROR',
      recoverable: true,
      details: body,
    };
  }

  /**
   * Extract a human-readable validation message from n8n error response
   */
  private extractValidationMessage(body: unknown): string {
    if (!body || typeof body !== 'object') {
      return 'Unknown validation error';
    }

    const errorBody = body as Record<string, unknown>;

    // n8n typically returns { message: string } or { error: string }
    if (typeof errorBody.message === 'string') {
      return errorBody.message;
    }

    if (typeof errorBody.error === 'string') {
      return errorBody.error;
    }

    // Try to extract from nested structure
    if (errorBody.errors && Array.isArray(errorBody.errors) && errorBody.errors.length > 0) {
      return errorBody.errors.map((e) => String(e)).join('; ');
    }

    return JSON.stringify(body);
  }

  /**
   * Determine if a validation error is recoverable by the agent
   */
  private isRecoverableValidationError(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Credential-related errors are NOT recoverable
    if (
      lowerMessage.includes('credential') ||
      lowerMessage.includes('authentication') ||
      lowerMessage.includes('oauth') ||
      lowerMessage.includes('api key')
    ) {
      return false;
    }

    // These are typically recoverable by fixing parameters or structure
    const recoverablePatterns = [
      'required',
      'missing',
      'invalid',
      'unknown',
      'not found',
      'parameter',
      'property',
      'type',
      'connection',
      'trigger',
    ];

    return recoverablePatterns.some((pattern) => lowerMessage.includes(pattern));
  }
}

/**
 * Create an N8nApiClient if credentials are available
 */
export function createN8nApiClient(baseUrl?: string, apiKey?: string): N8nApiClient | null {
  // Check if API key is missing or is a placeholder value
  if (!apiKey || apiKey === 'your-n8n-api-key' || apiKey.length < 10) {
    return null;
  }

  return new N8nApiClient({
    baseUrl: baseUrl || 'http://localhost:5678',
    apiKey,
  });
}
