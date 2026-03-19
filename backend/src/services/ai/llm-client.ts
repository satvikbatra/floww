/**
 * LLM Integration Layer - Multi-provider support for AI-powered analysis
 */

import { readFileSync } from 'fs';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '../../config/env.js';

// Schemas
export const PageAnalysisResultSchema = z.object({
  page_purpose: z.string(),
  target_users: z.array(z.string()).default([]),
  elements: z.array(z.object({
    selector: z.string(),
    description: z.string(),
    user_action: z.string().optional(),
  })),
  steps: z.array(z.string()),
  common_issues: z.array(z.string()).default([]),
});

export const WorkflowResultSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(z.object({
    page: z.string(),
    action: z.string(),
  })),
});

export type PageAnalysisResult = z.infer<typeof PageAnalysisResultSchema>;
export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;

/**
 * Base interface for LLM clients
 */
export interface BaseLLMClient {
  analyzeScreenshot(imagePath: string, prompt: string): Promise<Record<string, any>>;
  generateText(prompt: string): Promise<string>;
  generateStructured<T>(prompt: string, schema: z.ZodSchema<T>): Promise<T>;
}

/**
 * OpenAI Client (GPT-4 Vision)
 */
export class OpenAIClient implements BaseLLMClient {
  private client: OpenAI;
  private model = 'gpt-4o';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async analyzeScreenshot(imagePath: string, prompt: string): Promise<Record<string, any>> {
    const imageData = this.encodeImage(imagePath);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageData}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '{}';
    return this.parseJsonResponse(content);
  }

  async generateText(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
    });

    return response.choices[0]?.message?.content || '';
  }

  async generateStructured<T>(prompt: string, schema: z.ZodSchema<T>): Promise<T> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const data = JSON.parse(content);
    return schema.parse(data);
  }

  private encodeImage(imagePath: string): string {
    const imageBuffer = readFileSync(imagePath);
    return imageBuffer.toString('base64');
  }

  private parseJsonResponse(content: string): Record<string, any> {
    try {
      const startIdx = content.indexOf('{');
      const endIdx = content.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1) {
        return { raw_response: content };
      }
      const jsonStr = content.slice(startIdx, endIdx + 1);
      return JSON.parse(jsonStr);
    } catch (error) {
      return { raw_response: content };
    }
  }
}

/**
 * Anthropic Client (Claude with Vision)
 */
export class AnthropicClient implements BaseLLMClient {
  private client: Anthropic;
  private model = 'claude-sonnet-4-20250514';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyzeScreenshot(imagePath: string, prompt: string): Promise<Record<string, any>> {
    const imageData = this.encodeImage(imagePath);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageData,
              },
            },
          ],
        },
      ],
    });

    const textContent = response.content[0]?.type === 'text' 
      ? response.content[0].text 
      : '{}';
    return this.parseJsonResponse(textContent);
  }

  async generateText(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0]?.type === 'text' ? response.content[0].text : '';
  }

  async generateStructured<T>(prompt: string, schema: z.ZodSchema<T>): Promise<T> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
    const data = this.parseJsonResponse(content);
    return schema.parse(data);
  }

  private encodeImage(imagePath: string): string {
    const imageBuffer = readFileSync(imagePath);
    return imageBuffer.toString('base64');
  }

  private parseJsonResponse(content: string): Record<string, any> {
    try {
      const startIdx = content.indexOf('{');
      const endIdx = content.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1) {
        return { raw_response: content };
      }
      const jsonStr = content.slice(startIdx, endIdx + 1);
      return JSON.parse(jsonStr);
    } catch (error) {
      return { raw_response: content };
    }
  }
}

/**
 * Main LLM Client with provider abstraction
 */
export class LLMClient {
  private client: BaseLLMClient;
  private provider: string;

  constructor(provider?: string) {
    this.provider = provider || this.detectProvider();
    this.client = this.createClient();
  }

  private detectProvider(): string {
    if (env.OPENAI_API_KEY) return 'openai';
    if (env.ANTHROPIC_API_KEY) return 'anthropic';
    throw new Error('No LLM provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY');
  }

  private createClient(): BaseLLMClient {
    if (this.provider === 'openai' && env.OPENAI_API_KEY) {
      return new OpenAIClient(env.OPENAI_API_KEY);
    } else if (this.provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
      return new AnthropicClient(env.ANTHROPIC_API_KEY);
    }
    throw new Error(`Invalid provider: ${this.provider}`);
  }

  /**
   * Analyze a page using vision model
   */
  async analyzePage(
    screenshotPath: string,
    domSummary: Record<string, any>,
    elements: Array<Record<string, any>>
  ): Promise<PageAnalysisResult> {
    const prompt = this.buildPageAnalysisPrompt(domSummary, elements);
    const result = await this.client.analyzeScreenshot(screenshotPath, prompt);
    return PageAnalysisResultSchema.parse(result);
  }

  /**
   * Detect workflows from navigation patterns
   */
  async detectWorkflows(
    pages: Array<Record<string, any>>,
    navigationGraph: Record<string, string[]>
  ): Promise<WorkflowResult[]> {
    const prompt = this.buildWorkflowPrompt(pages, navigationGraph);
    const result = await this.client.generateText(prompt);
    const data = this.parseJsonResponse(result);
    const workflows = data.workflows || [];
    return workflows.map((w: any) => WorkflowResultSchema.parse(w));
  }

  /**
   * Translate documentation to another language
   */
  async translate(text: string, targetLanguage: string): Promise<string> {
    const prompt = `Translate the following documentation text to ${targetLanguage}.
Maintain markdown formatting. Only output the translated text.

Text to translate:
${text}
`;
    return this.client.generateText(prompt);
  }

  /**
   * Generate documentation from crawl data
   */
  async generateDocumentation(
    pages: Array<Record<string, any>>,
    workflows: WorkflowResult[]
  ): Promise<string> {
    const prompt = this.buildDocumentationPrompt(pages, workflows);
    return this.client.generateText(prompt);
  }

  private buildPageAnalysisPrompt(
    domSummary: Record<string, any>,
    elements: Array<Record<string, any>>
  ): string {
    const elementsJson = JSON.stringify(elements.slice(0, 20), null, 2);

    return `You are analyzing a web application page for documentation purposes.

PAGE CONTEXT:
- Title: ${domSummary.title || 'Unknown'}
- URL: ${domSummary.url || 'Unknown'}

EXTRACTED UI ELEMENTS:
${elementsJson}

SCREENSHOT: [Attached image]

TASK:
1. Explain the purpose of this page in 1-2 sentences.
2. For each UI element, provide:
   - A user-friendly description
   - What data should be entered (for inputs)
   - What happens when clicked (for buttons)
3. List the steps a user would take to complete the main task on this page.
4. Identify the target users for this page.
5. List any common issues or validation errors users might encounter.

OUTPUT FORMAT (JSON):
{
  "page_purpose": "...",
  "target_users": ["..."],
  "elements": [
    {
      "selector": "...",
      "description": "...",
      "user_action": "..."
    }
  ],
  "steps": [
    "Step 1: ...",
    "Step 2: ..."
  ],
  "common_issues": [
    "..."
  ]
}`;
  }

  private buildWorkflowPrompt(
    pages: Array<Record<string, any>>,
    navigationGraph: Record<string, string[]>
  ): string {
    const pagesSummary = pages
      .slice(0, 30)
      .map((p) => `- ${p.title || 'Unknown'}: ${p.url || 'Unknown'}`)
      .join('\n');

    const navSummary = Object.entries(navigationGraph)
      .slice(0, 20)
      .map(([src, dsts]) => `${src} -> ${dsts.slice(0, 5).join(', ')}`)
      .join('\n');

    return `You are analyzing user workflows in a web application.

PAGE DESCRIPTIONS:
${pagesSummary}

NAVIGATION GRAPH:
${navSummary}

TASK:
Identify distinct user workflows (e.g., "Create User", "Submit Report").
For each workflow, list the pages and actions involved.

OUTPUT FORMAT (JSON):
{
  "workflows": [
    {
      "name": "...",
      "description": "...",
      "steps": [
        {"page": "...", "action": "..."},
        ...
      ]
    }
  ]
}`;
  }

  private buildDocumentationPrompt(
    pages: Array<Record<string, any>>,
    workflows: WorkflowResult[]
  ): string {
    const pagesList = pages
      .slice(0, 50)
      .map((p, i) => `${i + 1}. ${p.title}: ${p.url}`)
      .join('\n');

    const workflowsList = workflows
      .map((w) => `- ${w.name}: ${w.description}`)
      .join('\n');

    return `Generate comprehensive documentation for a web application.

PAGES:
${pagesList}

WORKFLOWS:
${workflowsList}

Please create structured documentation in Markdown format including:
1. Overview
2. Key Features
3. User Workflows (step-by-step)
4. Page Descriptions
5. Troubleshooting Tips

Be concise but thorough.`;
  }

  private parseJsonResponse(content: string): Record<string, any> {
    try {
      const startIdx = content.indexOf('{');
      const endIdx = content.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1) {
        return {};
      }
      const jsonStr = content.slice(startIdx, endIdx + 1);
      return JSON.parse(jsonStr);
    } catch (error) {
      return {};
    }
  }

  getClient(): BaseLLMClient {
    return this.client;
  }
}

// Singleton instance
let llmClientInstance: LLMClient | null = null;

export function getLLMClient(provider?: string): LLMClient {
  if (!llmClientInstance) {
    llmClientInstance = new LLMClient(provider);
  }
  return llmClientInstance;
}
