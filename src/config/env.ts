import { config } from 'dotenv';
import { z } from 'zod';

// Load .env file
config();

// Supported Claude models (latest 4.5 versions)
// See: https://platform.claude.com/docs/en/about-claude/models/overview
export const CLAUDE_MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-5-20251101',
} as const;

export type ClaudeModelAlias = keyof typeof CLAUDE_MODELS;
export type ClaudeModelId = (typeof CLAUDE_MODELS)[ClaudeModelAlias];

// All valid model values (full IDs)
const MODEL_IDS = Object.values(CLAUDE_MODELS);

/**
 * Resolve model string to full model ID
 * Accepts both aliases (haiku, sonnet, opus) and full model IDs
 */
export function resolveModelId(model: string): ClaudeModelId {
  // If it's an alias, resolve to full ID
  if (model in CLAUDE_MODELS) {
    return CLAUDE_MODELS[model as ClaudeModelAlias];
  }
  // If it's already a full ID, return as-is
  if (MODEL_IDS.includes(model as ClaudeModelId)) {
    return model as ClaudeModelId;
  }
  // Unknown model, default to haiku
  console.error(`Warning: Unknown model "${model}", using haiku`);
  return CLAUDE_MODELS.haiku;
}

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  N8N_API_KEY: z.string().optional(),
  N8N_BASE_URL: z.string().url().optional().default('http://localhost:5678'),
  // Default model (can be overridden by CLI)
  // Accepts aliases (haiku, sonnet, opus) or full model IDs
  CLAUDE_MODEL: z.string().optional().default('haiku'),
  // Maximum retries for validation failures before asking human
  MAX_VALIDATION_RETRIES: z.coerce.number().int().min(0).max(10).optional().default(3),
});

const parsed = envSchema.safeParse(process.env);

// Only validate if not showing help
const isHelp = process.argv.includes('--help') || process.argv.includes('-h');

if (!parsed.success && !isHelp) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.success
  ? parsed.data
  : {
      ANTHROPIC_API_KEY: '',
      N8N_API_KEY: undefined,
      N8N_BASE_URL: 'http://localhost:5678',
      CLAUDE_MODEL: 'haiku',
      MAX_VALIDATION_RETRIES: 3,
    };
