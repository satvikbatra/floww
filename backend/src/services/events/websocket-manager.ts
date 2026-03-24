/**
 * WebSocket Event Manager for Real-time User Interaction
 * 
 * Manages real-time communication between crawler and frontend
 * for interactive prompts and updates.
 */

import { EventEmitter } from 'events';

export interface CrawlEvent {
  type: string;
  sessionId: string;
  timestamp: Date;
  data: any;
}

export enum CrawlEventType {
  // Progress events
  CRAWL_STARTED = 'crawl:started',
  CRAWL_PROGRESS = 'crawl:progress',
  CRAWL_COMPLETED = 'crawl:completed',
  CRAWL_FAILED = 'crawl:failed',
  
  // Page events
  PAGE_VISITED = 'page:visited',
  PAGE_SKIPPED = 'page:skipped',
  PAGE_ERROR = 'page:error',
  
  // Interaction events
  INTERACTION_REQUIRED = 'interaction:required',
  INTERACTION_WAITING = 'interaction:waiting',
  INTERACTION_COMPLETED = 'interaction:completed',
  INTERACTION_TIMEOUT = 'interaction:timeout',
  
  // User action events
  USER_ACTION_REQUESTED = 'user:action:requested',
  USER_ACTION_PROVIDED = 'user:action:provided',
}

export interface InteractionPrompt {
  id: string;
  sessionId: string;
  type: 'login' | 'form' | 'captcha' | '2fa' | 'confirmation';
  pageUrl: string;
  pageTitle: string;
  message: string;
  fields?: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
  }>;
  actions: Array<{
    id: string;
    label: string;
    type: 'primary' | 'secondary' | 'danger';
  }>;
  timeout: number;
  createdAt: Date;
}

/**
 * WebSocketEventManager - Manages real-time events
 */
export class WebSocketEventManager extends EventEmitter {
  private static instance: WebSocketEventManager;
  private connections = new Map<string, any>(); // sessionId -> ws connection
  private pendingPrompts = new Map<string, InteractionPrompt>();

  private constructor() {
    super();
  }

  static getInstance(): WebSocketEventManager {
    if (!WebSocketEventManager.instance) {
      WebSocketEventManager.instance = new WebSocketEventManager();
    }
    return WebSocketEventManager.instance;
  }

  /**
   * Register a WebSocket connection for a session
   */
  registerConnection(sessionId: string, connection: any) {
    this.connections.set(sessionId, connection);
    console.log(`✓ WebSocket connected for session: ${sessionId}`);
  }

  /**
   * Unregister a WebSocket connection
   */
  unregisterConnection(sessionId: string) {
    this.connections.delete(sessionId);
    console.log(`✗ WebSocket disconnected for session: ${sessionId}`);
  }

  /**
   * Send event to specific session
   */
  async sendToSession(sessionId: string, event: CrawlEvent) {
    const connection = this.connections.get(sessionId);
    if (!connection) return;

    // Check if connection is still open (readyState 1 = OPEN)
    if (connection.readyState !== 1) {
      this.connections.delete(sessionId);
      return;
    }

    try {
      connection.send(JSON.stringify(event));
    } catch (error) {
      console.error(`Failed to send event to session ${sessionId}:`, error);
      this.connections.delete(sessionId);
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  async broadcast(event: CrawlEvent) {
    for (const [sessionId, connection] of this.connections.entries()) {
      try {
        connection.send(JSON.stringify(event));
      } catch (error) {
        console.error(`Failed to broadcast to session ${sessionId}:`, error);
      }
    }
  }

  /**
   * Request user action via WebSocket
   */
  async requestUserAction(
    sessionId: string,
    prompt: InteractionPrompt
  ): Promise<any> {
    this.pendingPrompts.set(prompt.id, prompt);

    const event: CrawlEvent = {
      type: CrawlEventType.USER_ACTION_REQUESTED,
      sessionId,
      timestamp: new Date(),
      data: prompt,
    };

    await this.sendToSession(sessionId, event);

    // Return a promise that resolves when user provides action
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingPrompts.delete(prompt.id);
        reject(new Error('User action timeout'));
      }, prompt.timeout);

      // Listen for user response
      this.once(`user:response:${prompt.id}`, (response) => {
        clearTimeout(timeout);
        this.pendingPrompts.delete(prompt.id);
        resolve(response);
      });
    });
  }

  /**
   * Receive user action response
   */
  provideUserAction(promptId: string, response: any) {
    this.emit(`user:response:${promptId}`, response);
  }

  /**
   * Send crawl progress update
   */
  async sendProgress(sessionId: string, progress: {
    pagesVisited: number;
    pagesTotal: number;
    currentUrl: string;
    status: string;
  }) {
    const event: CrawlEvent = {
      type: CrawlEventType.CRAWL_PROGRESS,
      sessionId,
      timestamp: new Date(),
      data: progress,
    };

    await this.sendToSession(sessionId, event);
  }

  /**
   * Send page visited event
   */
  async sendPageVisited(sessionId: string, pageData: {
    url: string;
    title: string;
    status: number;
    loadTime: number;
  }) {
    const event: CrawlEvent = {
      type: CrawlEventType.PAGE_VISITED,
      sessionId,
      timestamp: new Date(),
      data: pageData,
    };

    await this.sendToSession(sessionId, event);
  }

  /**
   * Send interaction required notification
   */
  async sendInteractionRequired(sessionId: string, interaction: {
    type: string;
    message: string;
    pageUrl: string;
  }) {
    const event: CrawlEvent = {
      type: CrawlEventType.INTERACTION_REQUIRED,
      sessionId,
      timestamp: new Date(),
      data: interaction,
    };

    await this.sendToSession(sessionId, event);
  }

  /**
   * Get pending prompts
   */
  getPendingPrompts(): InteractionPrompt[] {
    return Array.from(this.pendingPrompts.values());
  }

  /**
   * Check if session has connection
   */
  hasConnection(sessionId: string): boolean {
    return this.connections.has(sessionId);
  }
}

// Export singleton instance
export const wsEventManager = WebSocketEventManager.getInstance();
