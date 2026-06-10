import { prisma } from './db'

type LogLevel = 'error' | 'warn' | 'info'

export async function log(
  level: LogLevel,
  context: string,
  message: string,
  details?: Record<string, unknown>,
  businessId?: number,
) {
  const prefix = `[${level.toUpperCase()}][${context}]`
  if (level === 'error') {
    console.error(prefix, message, details ?? '')
  } else if (level === 'warn') {
    console.warn(prefix, message, details ?? '')
  } else {
    console.log(prefix, message, details ?? '')
  }

  try {
    await prisma.systemLog.create({
      data: {
        level,
        context,
        message,
        details: details as any ?? undefined,
        businessId: businessId ?? null,
      },
    })
  } catch {
    // Never let logging break the caller
  }
}

export const logError = (context: string, message: string, details?: Record<string, unknown>, businessId?: number) =>
  log('error', context, message, details, businessId)

export const logWarn = (context: string, message: string, details?: Record<string, unknown>, businessId?: number) =>
  log('warn', context, message, details, businessId)

export const logInfo = (context: string, message: string, details?: Record<string, unknown>, businessId?: number) =>
  log('info', context, message, details, businessId)
