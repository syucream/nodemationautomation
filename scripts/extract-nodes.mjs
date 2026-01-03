#!/usr/bin/env node
/**
 * Extract node definitions from n8n-nodes-base package
 * This script parses node files and extracts description objects
 * without requiring runtime dependencies like n8n-core.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nodesBasePath = join(__dirname, '../node_modules/n8n-nodes-base/dist/nodes');
const langchainPath = join(__dirname, '../node_modules/@n8n/n8n-nodes-langchain/dist/nodes');

// Nodes we want to support
// Format: { pkg: 'base'|'langchain', path: string, type?: string }
const ENABLED_NODES = [
  // === Core Triggers (all non-service triggers) ===
  { pkg: 'base', path: 'ManualTrigger/ManualTrigger' },
  { pkg: 'base', path: 'Webhook/Webhook' },
  { pkg: 'base', path: 'Schedule/ScheduleTrigger' },
  { pkg: 'base', path: 'ErrorTrigger/ErrorTrigger' },
  { pkg: 'base', path: 'WorkflowTrigger/WorkflowTrigger' },
  { pkg: 'base', path: 'N8nTrigger/N8nTrigger' },
  { pkg: 'base', path: 'LocalFileTrigger/LocalFileTrigger' },
  { pkg: 'base', path: 'SseTrigger/SseTrigger' },
  { pkg: 'base', path: 'Cron/Cron' },

  // === Core Actions / Control Flow ===
  { pkg: 'base', path: 'HttpRequest/HttpRequest' },
  { pkg: 'base', path: 'Set/Set' },
  { pkg: 'base', path: 'If/If' },
  { pkg: 'base', path: 'Switch/Switch' },
  { pkg: 'base', path: 'Code/Code' },
  { pkg: 'base', path: 'Merge/Merge' },
  { pkg: 'base', path: 'SplitInBatches/SplitInBatches' },
  { pkg: 'base', path: 'Filter/Filter' },
  { pkg: 'base', path: 'Loop/LoopOver' },
  { pkg: 'base', path: 'Wait/Wait' },
  { pkg: 'base', path: 'NoOp/NoOp' },
  { pkg: 'base', path: 'ExecuteWorkflow/ExecuteWorkflow' },
  { pkg: 'base', path: 'ExecuteWorkflowTrigger/ExecuteWorkflowTrigger' },
  { pkg: 'base', path: 'RespondToWebhook/RespondToWebhook' },
  { pkg: 'base', path: 'Function/Function' },
  { pkg: 'base', path: 'FunctionItem/FunctionItem' },
  { pkg: 'base', path: 'ItemLists/ItemLists' },
  { pkg: 'base', path: 'DateTime/DateTime' },
  { pkg: 'base', path: 'Crypto/Crypto' },
  { pkg: 'base', path: 'ReadBinaryFiles/ReadBinaryFiles' },
  { pkg: 'base', path: 'WriteBinaryFile/WriteBinaryFile' },
  { pkg: 'base', path: 'Xml/Xml' },
  { pkg: 'base', path: 'Html/Html' },
  { pkg: 'base', path: 'Markdown/Markdown' },
  { pkg: 'base', path: 'SpreadsheetFile/SpreadsheetFile' },

  // === AI / LangChain Nodes ===
  { pkg: 'langchain', path: 'agents/Agent/Agent', type: 'agent' },
  { pkg: 'langchain', path: 'chains/ChainLLM/ChainLLM', type: 'lmChainLlm' },
  { pkg: 'langchain', path: 'chains/ChainRetrievalQA/ChainRetrievalQA', type: 'chainRetrievalQa' },
  { pkg: 'langchain', path: 'chains/ChainSummarization/ChainSummarization', type: 'chainSummarization' },
  { pkg: 'langchain', path: 'chains/InformationExtractor/InformationExtractor', type: 'informationExtractor' },
  { pkg: 'langchain', path: 'chains/SentimentAnalysis/SentimentAnalysis', type: 'sentimentAnalysis' },
  { pkg: 'langchain', path: 'chains/TextClassifier/TextClassifier', type: 'textClassifier' },
  { pkg: 'langchain', path: 'llms/LMChatOpenAi/LMChatOpenAi', type: 'lmChatOpenAi' },
  { pkg: 'langchain', path: 'llms/LMChatAnthropic/LMChatAnthropic', type: 'lmChatAnthropic' },
  { pkg: 'langchain', path: 'llms/LmChatGoogleGemini/LmChatGoogleGemini', type: 'lmChatGoogleGemini' },
  { pkg: 'langchain', path: 'llms/LmChatGroq/LmChatGroq', type: 'lmChatGroq' },
  { pkg: 'langchain', path: 'llms/LMChatOllama/LMChatOllama', type: 'lmChatOllama' },
  { pkg: 'langchain', path: 'memory/MemoryBufferWindow/MemoryBufferWindow', type: 'memoryBufferWindow' },
  { pkg: 'langchain', path: 'memory/MemoryVectorStore/MemoryVectorStore', type: 'memoryVectorStore' },
  { pkg: 'langchain', path: 'tools/ToolCode/ToolCode', type: 'toolCode' },
  { pkg: 'langchain', path: 'tools/ToolHttpRequest/ToolHttpRequest', type: 'toolHttpRequest' },
  { pkg: 'langchain', path: 'tools/ToolWorkflow/ToolWorkflow', type: 'toolWorkflow' },
  { pkg: 'langchain', path: 'tools/ToolWikipedia/ToolWikipedia', type: 'toolWikipedia' },
  { pkg: 'langchain', path: 'tools/ToolCalculator/ToolCalculator', type: 'toolCalculator' },
  { pkg: 'langchain', path: 'vector_store/VectorStoreInMemory/VectorStoreInMemory', type: 'vectorStoreInMemory' },
  { pkg: 'langchain', path: 'embeddings/EmbeddingsOpenAi/EmbeddingsOpenAi', type: 'embeddingsOpenAi' },
  { pkg: 'langchain', path: 'document_loaders/DocumentDefaultDataLoader/DocumentDefaultDataLoader', type: 'documentDefaultDataLoader' },
  { pkg: 'langchain', path: 'text_splitters/TextSplitterRecursiveCharacterTextSplitter/TextSplitterRecursiveCharacterTextSplitter', type: 'textSplitterRecursiveCharacterTextSplitter' },
  { pkg: 'langchain', path: 'trigger/ChatTrigger/ChatTrigger', type: 'chatTrigger' },

  // === Popular Apps ===
  { pkg: 'base', path: 'Slack/Slack', type: 'slack' },
  { pkg: 'base', path: 'Slack/SlackTrigger' },
  { pkg: 'base', path: 'Google/Gmail/Gmail', type: 'gmail' },
  { pkg: 'base', path: 'Google/Sheet/GoogleSheets', type: 'googleSheets' },
  { pkg: 'base', path: 'Discord/Discord' },
  { pkg: 'base', path: 'Telegram/Telegram', type: 'telegram' },
  { pkg: 'base', path: 'Notion/Notion' },
  { pkg: 'base', path: 'Airtable/Airtable' },
  { pkg: 'base', path: 'GitHub/GitHub', type: 'github' },
  { pkg: 'base', path: 'Jira/Jira', type: 'jira' },
  { pkg: 'base', path: 'Trello/Trello' },
  { pkg: 'base', path: 'OpenAi/OpenAi', type: 'openAi' },
  { pkg: 'base', path: 'Postgres/Postgres', type: 'postgres' },
  { pkg: 'base', path: 'MySql/MySql', type: 'mySql' },
  { pkg: 'base', path: 'Redis/Redis' },
  { pkg: 'base', path: 'S3/S3', type: 'awsS3' },
];

/**
 * Convert PascalCase to camelCase
 */
function toCamelCase(str) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Extract a simplified description from node file
 * We parse the JS file to extract key info without importing it
 */
function extractNodeInfo(pkg, nodePath, overrideType) {
  const basePath = pkg === 'langchain' ? langchainPath : nodesBasePath;
  const prefix = pkg === 'langchain' ? '@n8n/n8n-nodes-langchain.' : 'n8n-nodes-base.';
  const fullPath = join(basePath, `${nodePath}.node.js`);

  if (!existsSync(fullPath)) {
    if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
      console.error(`Not found: ${fullPath}`);
    }
    return null;
  }

  const content = readFileSync(fullPath, 'utf-8');

  // Try to get node type from .node.json file (most reliable)
  const jsonPath = join(basePath, `${nodePath}.node.json`);
  let nodeType = null;
  if (existsSync(jsonPath)) {
    try {
      const jsonContent = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      nodeType = jsonContent.node;
    } catch (e) {
      // Fall through to fallback
    }
  }

  // Fallback: construct node type from path
  if (!nodeType) {
    const parts = nodePath.split('/');
    const nodeName = overrideType || toCamelCase(parts[parts.length - 1]);
    nodeType = `${prefix}${nodeName}`;
  }

  // Extract basic info using regex - be more specific to avoid false matches
  const displayNameMatch = content.match(/displayName:\s*['"]([^'"]{2,50})['"]/);
  const descriptionMatch = content.match(/^\s*description:\s*['"]([^'"]+)['"]/m);
  const versionMatch = content.match(/version:\s*(\[[\d,.\s]+\]|\d+)/);
  const groupMatch = content.match(/group:\s*\[['"](\w+)['"]\]/);

  // Extract resources (operations) - look for resource property specifically
  const resourceMatch = content.match(/displayName:\s*['"]Resource['"],\s*name:\s*['"]resource['"],[\s\S]*?options:\s*\[([\s\S]*?)\],/);

  let resources = [];
  if (resourceMatch) {
    const resourcesStr = resourceMatch[1];
    const resourceItems = resourcesStr.matchAll(/name:\s*['"]([^'"]+)['"],\s*value:\s*['"]([^'"]+)['"]/g);
    for (const match of resourceItems) {
      resources.push({ name: match[1], value: match[2] });
    }
  }

  // Parse version
  let version = 1;
  if (versionMatch) {
    const versionStr = versionMatch[1];
    if (versionStr.startsWith('[')) {
      // Array of versions, get the latest
      const versions = versionStr.match(/[\d.]+/g);
      if (versions) {
        version = Math.max(...versions.map(v => parseFloat(v)));
      }
    } else {
      version = parseFloat(versionStr);
    }
  }

  // Determine category
  let category = groupMatch?.[1] || 'action';
  if (nodePath.toLowerCase().includes('trigger')) {
    category = 'trigger';
  }

  return {
    type: nodeType,
    displayName: displayNameMatch?.[1] || parts[parts.length - 1],
    description: descriptionMatch?.[1] || '',
    version: Math.floor(version), // Use integer version
    category: category,
    resources: resources.length > 0 ? resources : undefined,
  };
}

// Check for verbose flag
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

// Extract all enabled nodes
const nodes = [];
let errorCount = 0;
for (const nodeConfig of ENABLED_NODES) {
  const { pkg, path: nodePath, type: overrideType } = nodeConfig;
  if (verbose) {
    console.log(`Extracting: [${pkg}] ${nodePath}`);
  }
  const info = extractNodeInfo(pkg, nodePath, overrideType);
  if (info) {
    nodes.push(info);
    if (verbose) {
      console.log(`  ✓ ${info.displayName} (${info.type})`);
    }
  } else {
    errorCount++;
  }
}

// Write output
const outputPath = join(__dirname, '../src/generated/node-definitions.json');
const outputDir = dirname(outputPath);

// Create directory if needed
import { mkdirSync } from 'fs';
try {
  mkdirSync(outputDir, { recursive: true });
} catch (e) {}

writeFileSync(outputPath, JSON.stringify(nodes, null, 2));

if (verbose) {
  console.log(`\nWritten ${nodes.length} node definitions to ${outputPath}`);
  if (errorCount > 0) {
    console.log(`  (${errorCount} nodes failed to extract)`);
  }
} else {
  const status = errorCount > 0 ? ` (${errorCount} errors)` : '';
  console.log(`Extracted ${nodes.length} node definitions${status}`);
}
