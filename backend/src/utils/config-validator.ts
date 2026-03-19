/**
 * Configuration Validation for Floww Projects
 */

import { z } from 'zod';
import * as yaml from 'yaml';
import { readFileSync } from 'fs';

// Validation schemas
export const ScopeConfigSchema = z.object({
  maxDepth: z.number().min(1).max(20).default(5),
  maxPages: z.number().min(1).max(1000).default(100),
  excludePatterns: z.array(z.string()).default([]),
  includePatterns: z.array(z.string()).default([]),
  followExternalLinks: z.boolean().default(false),
});

export const AuthConfigSchema = z.object({
  type: z.enum(['none', 'email_password', 'session', 'oauth']).default('none'),
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  sessionCookies: z.record(z.string()).optional(),
  loginUrl: z.string().url().optional(),
  domain: z.string().optional(),
});

export const OutputConfigSchema = z.object({
  formats: z.array(z.enum(['markdown', 'html', 'pdf', 'word'])).default(['markdown']),
  outputDir: z.string().min(1).default('./docs'),
  includeScreenshots: z.boolean().default(true),
  includeWorkflows: z.boolean().default(true),
});

export const ProjectConfigSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  scope: ScopeConfigSchema.optional(),
  auth: AuthConfigSchema.optional(),
  output: OutputConfigSchema.optional(),
  description: z.string().optional(),
  screenshot: z.boolean().default(true),
  rateLimit: z.number().min(0).default(1.0),
  headless: z.boolean().default(true),
});

export type ScopeConfig = z.infer<typeof ScopeConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/**
 * ConfigValidator - Validates Floww configurations
 */
export class ConfigValidator {
  /**
   * Validate URL
   */
  static validateUrl(url: string): string[] {
    const errors: string[] = [];

    if (!url) {
      errors.push('base_url is required');
      return errors;
    }

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push(`Invalid URL scheme: ${parsed.protocol}. Must be http or https.`);
      }
      if (!parsed.hostname) {
        errors.push('Invalid URL: missing domain');
      }
    } catch (error) {
      errors.push(`Invalid URL: ${error}`);
    }

    return errors;
  }

  /**
   * Validate scope configuration
   */
  static validateScope(scope: Partial<ScopeConfig>): string[] {
    const errors: string[] = [];

    if (scope.maxDepth !== undefined) {
      if (typeof scope.maxDepth !== 'number' || scope.maxDepth < 1 || scope.maxDepth > 20) {
        errors.push('max_depth must be an integer between 1 and 20');
      }
    }

    if (scope.maxPages !== undefined) {
      if (typeof scope.maxPages !== 'number' || scope.maxPages < 1 || scope.maxPages > 1000) {
        errors.push('max_pages must be an integer between 1 and 1000');
      }
    }

    if (scope.excludePatterns) {
      for (const pattern of scope.excludePatterns) {
        if (typeof pattern !== 'string') {
          errors.push(`Invalid exclude pattern: ${pattern}`);
        }
      }
    }

    if (scope.includePatterns) {
      for (const pattern of scope.includePatterns) {
        if (typeof pattern !== 'string') {
          errors.push(`Invalid include pattern: ${pattern}`);
        }
      }
    }

    return errors;
  }

  /**
   * Validate auth configuration
   */
  static validateAuth(auth: Partial<AuthConfig>): string[] {
    const errors: string[] = [];

    const authType = auth.type || 'none';
    const validTypes = ['none', 'email_password', 'session', 'oauth'];

    if (!validTypes.includes(authType)) {
      errors.push(`Invalid auth type: ${authType}. Must be one of: ${validTypes.join(', ')}`);
    }

    if (authType === 'email_password') {
      if (!auth.email) {
        errors.push('email is required for email_password auth');
      }
      if (!auth.password) {
        errors.push('password is required for email_password auth');
      }

      if (auth.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(auth.email)) {
          errors.push(`Invalid email format: ${auth.email}`);
        }
      }
    }

    if (authType === 'session') {
      if (!auth.sessionCookies || Object.keys(auth.sessionCookies).length === 0) {
        errors.push('session_cookies is required for session auth');
      }
    }

    return errors;
  }

  /**
   * Validate output configuration
   */
  static validateOutput(output: Partial<OutputConfig>): string[] {
    const errors: string[] = [];

    const validFormats = ['markdown', 'html', 'pdf', 'word'];
    const formats = output.formats || ['markdown'];

    for (const fmt of formats) {
      if (!validFormats.includes(fmt)) {
        errors.push(`Invalid output format: ${fmt}. Must be one of: ${validFormats.join(', ')}`);
      }
    }

    if (output.outputDir !== undefined) {
      if (typeof output.outputDir !== 'string' || !output.outputDir) {
        errors.push('output_dir must be a non-empty string');
      }
    }

    return errors;
  }

  /**
   * Validate complete project configuration
   */
  static validateProject(config: Partial<ProjectConfig>): string[] {
    const errors: string[] = [];

    // Validate required fields
    if (!config.name) {
      errors.push('name is required');
    }

    if (!config.baseUrl) {
      errors.push('base_url is required');
    } else {
      errors.push(...this.validateUrl(config.baseUrl));
    }

    // Validate nested configs
    if (config.scope) {
      errors.push(...this.validateScope(config.scope));
    }

    if (config.auth) {
      errors.push(...this.validateAuth(config.auth));
    }

    if (config.output) {
      errors.push(...this.validateOutput(config.output));
    }

    return errors;
  }

  /**
   * Load and validate YAML config file
   */
  static loadYamlConfig(filePath: string): ProjectConfig {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const data = yaml.parse(fileContent);

      // Validate
      const errors = this.validateProject(data);
      if (errors.length > 0) {
        throw new ConfigValidationError(errors);
      }

      // Parse with Zod for type safety
      return ProjectConfigSchema.parse(data);
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        throw error;
      }
      throw new Error(`Failed to load config: ${error}`);
    }
  }

  /**
   * Create default configuration
   */
  static createDefault(name: string, baseUrl: string): ProjectConfig {
    return {
      name,
      baseUrl,
      scope: {
        maxDepth: 5,
        maxPages: 100,
        excludePatterns: [],
        includePatterns: [],
        followExternalLinks: false,
      },
      auth: {
        type: 'none',
      },
      output: {
        formats: ['markdown'],
        outputDir: './docs',
        includeScreenshots: true,
        includeWorkflows: true,
      },
      screenshot: true,
      rateLimit: 1.0,
      headless: true,
    };
  }

  /**
   * Export configuration to YAML
   */
  static toYaml(config: ProjectConfig): string {
    return yaml.stringify(config);
  }
}

/**
 * Custom validation error
 */
export class ConfigValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors.join('\n'));
    this.name = 'ConfigValidationError';
  }
}
