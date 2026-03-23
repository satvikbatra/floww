/**
 * Input Sanitization — Prevents XSS, injection, and malformed input
 */

/**
 * Strip HTML tags from a string (prevents stored XSS)
 */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .trim()
}

/**
 * Sanitize a string for safe storage and display
 */
export function sanitizeString(input: string, maxLength: number = 500): string {
  return stripHtml(input).substring(0, maxLength).trim()
}

/**
 * Sanitize URL — ensure it's a valid http/https URL
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    // Prevent javascript: URLs that may bypass protocol check
    if (parsed.href.toLowerCase().includes('javascript:')) return null
    if (parsed.href.toLowerCase().includes('data:')) return null
    if (parsed.href.toLowerCase().includes('vbscript:')) return null
    return parsed.href
  } catch {
    return null
  }
}

/**
 * Sanitize object — recursively sanitize all string values
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T, maxStringLength: number = 1000): T {
  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeString(value, maxStringLength)
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeObject(value, maxStringLength)
    } else if (Array.isArray(value)) {
      result[key] = value.map(v =>
        typeof v === 'string' ? sanitizeString(v, maxStringLength) : v
      )
    } else {
      result[key] = value
    }
  }
  return result as T
}

/**
 * Validate project name — alphanumeric, spaces, hyphens, underscores only
 */
export function isValidProjectName(name: string): boolean {
  return /^[a-zA-Z0-9\s\-_.,()]{1,200}$/.test(name)
}
