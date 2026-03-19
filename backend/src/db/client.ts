import { PrismaClient } from '@prisma/client'
import { appConfig } from '../config/env'

// Prisma Client singleton
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: appConfig.app.isDev ? ['query', 'error', 'warn'] : ['error'],
  })
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

export const db = globalThis.prisma ?? prismaClientSingleton()

if (appConfig.app.isDev) globalThis.prisma = db

// Graceful shutdown
export const disconnectDB = async () => {
  await db.$disconnect()
}
