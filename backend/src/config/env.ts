import { config } from 'dotenv'
import { z } from 'zod'

// Load environment variables
config()

// Environment schema with validation
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('8080').transform(Number),
  
  // Database
  DATABASE_URL: z.string().min(1),
  
  // Security
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('30m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  DISABLE_AUTH: z.string().transform(val => val === 'true').default('false'),
  
  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:4000').transform(s => s.split(',')),
  
  //Storage
  STORAGE_PATH: z.string().default('./storage'),
  ARCHIVE_PATH: z.string().default('./archive_storage'),
  GRAPH_PATH: z.string().default('./graph_storage'),
  
  // Optional: LLM
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  
  // Optional: Redis
  REDIS_URL: z.string().optional(),
})

// Parse and validate environment
const parseEnv = () => {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:')
      console.error(error.format())
      process.exit(1)
    }
    throw error
  }
}

export const env = parseEnv()

// Type-safe config object
export const appConfig = {
  app: {
    name: 'Floww API',
    version: '1.0.0',
    env: env.NODE_ENV,
    port: env.PORT,
    isDev: env.NODE_ENV === 'development',
    isProd: env.NODE_ENV === 'production',
  },
  
  database: {
    url: env.DATABASE_URL,
  },
  
  auth: {
    jwtSecret: env.JWT_SECRET,
    accessTokenExpiry: env.JWT_ACCESS_EXPIRY,
    refreshTokenExpiry: env.JWT_REFRESH_EXPIRY,
    disableAuth: env.DISABLE_AUTH,
  },
  
  cors: {
    origins: env.CORS_ORIGINS,
  },
  
  storage: {
    basePath: env.STORAGE_PATH,
    archivePath: env.ARCHIVE_PATH,
    graphPath: env.GRAPH_PATH,
  },
  
  llm: {
    openaiKey: env.OPENAI_API_KEY,
    anthropicKey: env.ANTHROPIC_API_KEY,
  },
  
  redis: {
    url: env.REDIS_URL,
  },
} as const

// Export types
export type AppConfig = typeof appConfig
