import { z } from 'zod'

// ============== Auth Schemas ==============

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string().min(3).max(100),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().optional(),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>

// ============== Project Schemas ==============

export const projectConfigSchema = z.object({
  maxDepth: z.number().min(1).max(20).default(5),
  maxPages: z.number().min(1).max(1000).default(100),
  includePatterns: z.array(z.string()).default([]),
  excludePatterns: z.array(z.string()).default([]),
  outputFormats: z.array(z.string()).default(['markdown', 'html']),
  languages: z.array(z.string()).default(['en']),
  stealthMode: z.boolean().default(false),
  delayMs: z.number().min(0).max(10000).default(1000),
  depthOnlyMode: z.boolean().default(false), // Default: crawl same domain (false = SAME_DOMAIN strategy)
  interactionTimeout: z.number().min(10000).max(900000).default(300000), // User interaction timeout (5 min default)
  // Similarity detection options
  maxSimilarUrlsPerPattern: z.number().min(1).max(10).default(3), // Max similar URLs per pattern (e.g., :77, :78, :79...)
  contentSimilarityThreshold: z.number().min(0).max(1).default(0.85), // Content similarity threshold (0-1)
})

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  baseUrl: z.string().url('Invalid URL'),
  config: projectConfigSchema.optional(),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  baseUrl: z.string().url().optional(),
  config: projectConfigSchema.optional(),
  isActive: z.boolean().optional(),
})

export type ProjectConfig = z.infer<typeof projectConfigSchema>
export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

// ============== Crawl Schemas ==============

export const startCrawlSchema = z.object({
  config: projectConfigSchema.optional(),
})

export type StartCrawlInput = z.infer<typeof startCrawlSchema>

// ============== Document Schemas ==============

export const generateDocumentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  format: z.enum(['MARKDOWN', 'HTML', 'PDF', 'JSON']).default('MARKDOWN'),
  crawlSessionId: z.string().uuid().optional(),
  includeScreenshots: z.boolean().default(true),
  includeAiAnalysis: z.boolean().default(true),
  language: z.string().default('en'),
})

export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>

// Validation helper
export const validate = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  return schema.parse(data)
}
