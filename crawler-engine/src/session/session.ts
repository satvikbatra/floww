export type SessionState = 'good' | 'bad' | 'retired'

export class Session {
  public readonly id: string
  public state: SessionState = 'good'
  public cookies: any[] = []
  public proxyUrl?: string
  public userAgent?: string

  private _usageCount = 0
  private _errorCount = 0
  private _maxErrors: number
  private _maxUsage: number

  constructor(id: string, options?: {
    proxyUrl?: string
    userAgent?: string
    cookies?: any[]
    maxErrors?: number
    maxUsage?: number
  }) {
    this.id = id
    this.proxyUrl = options?.proxyUrl
    this.userAgent = options?.userAgent
    this.cookies = options?.cookies || []
    this._maxErrors = options?.maxErrors ?? 5
    this._maxUsage = options?.maxUsage ?? 100
  }

  markGood(): void {
    this._usageCount++
    if (this._usageCount >= this._maxUsage) {
      this.state = 'retired'
    }
  }

  markBad(): void {
    this._errorCount++
    if (this._errorCount >= this._maxErrors) {
      this.state = 'retired'
    } else {
      this.state = 'bad'
    }
  }

  retire(): void {
    this.state = 'retired'
  }

  get isUsable(): boolean {
    return this.state !== 'retired'
  }

  get usageCount(): number { return this._usageCount }
  get errorCount(): number { return this._errorCount }
}
