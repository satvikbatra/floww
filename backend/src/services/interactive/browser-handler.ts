/**
 * Browser-Based Interactive Handler
 * 
 * Opens a visible Chrome window for user interaction instead of terminal prompts.
 * Allows users to manually handle login, forms, captcha, etc.
 */

import { Page, BrowserContext } from 'playwright';
import { EventEmitter } from 'events';

export enum InteractionType {
  LOGIN_FORM = 'login_form',
  REQUIRED_FORM = 'required_form',
  CAPTCHA = 'captcha',
  TWO_FACTOR = 'two_factor',
  MANUAL_ACTION = 'manual_action',
  CONFIRMATION = 'confirmation',
}

export interface InteractionRequest {
  id: string;
  type: InteractionType;
  pageUrl: string;
  pageTitle: string;
  message: string;
  fields?: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
  }>;
  expectedActions?: string[];
  timeout?: number; // milliseconds
}

export interface InteractionResponse {
  requestId: string;
  success: boolean;
  action: 'completed' | 'skipped' | 'cancelled';
  data?: Record<string, any>;
  error?: string;
}

/**
 * BrowserInteractiveHandler - Shows browser UI for user interaction
 */
export class BrowserInteractiveHandler extends EventEmitter {
  private interactivePage: Page | null = null;
  private isWaitingForUser = false;
  private currentRequest: InteractionRequest | null = null;
  private userResponsePromise: Promise<InteractionResponse> | null = null;
  private resolveUserResponse: ((response: InteractionResponse) => void) | null = null;
  private consoleListenerSetup = false; // Track if console listener is already setup

  constructor(private context: BrowserContext) {
    super();
  }

  /**
   * Request user interaction by showing browser window
   */
  async requestInteraction(request: InteractionRequest): Promise<InteractionResponse> {
    if (this.isWaitingForUser) {
      throw new Error('Already waiting for user interaction');
    }

    this.isWaitingForUser = true;
    this.currentRequest = request;

    // Emit event for WebSocket/frontend notification
    this.emit('interaction:required', request);

    try {
      // Create visible browser page if not exists
      if (!this.interactivePage) {
        this.interactivePage = await this.context.newPage();
        
        // Setup console listener only once
        this.setupConsoleListener();
      }

      // Show the page that needs interaction
      if (this.interactivePage.url() !== request.pageUrl) {
        await this.interactivePage.goto(request.pageUrl, { waitUntil: 'networkidle' });
      }

      // Inject helper UI overlay
      await this.injectHelperUI(request);
      
      // Re-inject UI if page navigates (e.g., after login redirect)
      this.interactivePage.on('load', async () => {
        if (this.isWaitingForUser && this.currentRequest) {
          console.log(`   🔄 Page reloaded, re-injecting helper UI...`)
          await this.injectHelperUI(this.currentRequest)
        }
      })
      
      // Bring browser window to front (platform-specific)
      await this.interactivePage.bringToFront();
      
      console.log(`\n${'='.repeat(60)}`)
      console.log(`🖥️  BROWSER WINDOW OPENED`)
      console.log(`${'='.repeat(60)}`)
      console.log(`Type: ${request.type}`)
      console.log(`Page: ${request.pageUrl}`)
      console.log(`Message: ${request.message}`)
      console.log(`\n👉 Please complete the action in the browser window`)
      console.log(`   and click one of the buttons in the floating UI`)
      console.log(`${'='.repeat(60)}\n`)

      // Create promise for user response
      this.userResponsePromise = new Promise((resolve) => {
        this.resolveUserResponse = resolve;
      });

      // Set timeout if specified
      const timeout = request.timeout || 300000; // 5 minutes default
      const timeoutPromise = new Promise<InteractionResponse>((resolve) => {
        setTimeout(() => {
          resolve({
            requestId: request.id,
            success: false,
            action: 'cancelled',
            error: 'User interaction timeout',
          });
        }, timeout);
      });

      // Wait for either user response or timeout
      const response = await Promise.race([this.userResponsePromise!, timeoutPromise]);

      this.emit('interaction:completed', response);
      return response;
    } finally {
      this.isWaitingForUser = false;
      this.currentRequest = null;
      this.userResponsePromise = null;
      this.resolveUserResponse = null;
    }
  }

  /**
   * User manually clicks "Continue" in the browser
   */
  async markCompleted(data?: Record<string, any>) {
    if (!this.resolveUserResponse || !this.currentRequest) {
      // Silently ignore if no active request (handles duplicate clicks)
      return;
    }

    // Store reference before async operations
    const request = this.currentRequest;
    const resolve = this.resolveUserResponse;

    // Extract form data if available
    const extractedData = this.interactivePage
      ? await this.extractFormData()
      : {};
    
    // Remove the UI overlay
    await this.removeHelperUI();
    
    console.log(`\n✅ User completed interaction - continuing crawl...\n`);

    resolve({
      requestId: request.id,
      success: true,
      action: 'completed',
      data: { ...extractedData, ...data },
    });
  }

  /**
   * User clicks "Skip"
   */
  async markSkipped() {
    if (!this.resolveUserResponse || !this.currentRequest) {
      // Silently ignore if no active request (handles duplicate clicks)
      return;
    }

    // Store reference before async operations
    const request = this.currentRequest;
    const resolve = this.resolveUserResponse;
    
    // Remove the UI overlay
    await this.removeHelperUI();
    
    console.log(`\n⏭️  User skipped page - continuing to next...\n`);

    resolve({
      requestId: request.id,
      success: true,
      action: 'skipped',
    });
  }

  /**
   * User clicks "Cancel"
   */
  async markCancelled() {
    if (!this.resolveUserResponse || !this.currentRequest) {
      // Silently ignore if no active request (handles duplicate clicks)
      return;
    }

    // Store reference before async operations
    const request = this.currentRequest;
    const resolve = this.resolveUserResponse;
    
    // Remove the UI overlay
    await this.removeHelperUI();
    
    console.log(`\n❌ User cancelled crawl - stopping...\n`);

    resolve({
      requestId: request.id,
      success: false,
      action: 'cancelled',
    });
  }

  /**
   * Remove the helper UI overlay
   */
  private async removeHelperUI() {
    if (!this.interactivePage) return;
    
    try {
      await this.interactivePage.evaluate(() => {
        const existing = document.getElementById('floww-helper-ui');
        if (existing) existing.remove();
      });
    } catch (error) {
      // Ignore errors if page is navigated away
    }
  }

  /**
   * Inject floating helper UI into the page
   */
  private async injectHelperUI(request: InteractionRequest) {
    if (!this.interactivePage) return;

    // Pass code as string to avoid transpilation issues
    const injectionCode = `
      (function(req) {
        // Remove existing helper if any
        var existing = document.getElementById('floww-helper-ui');
        if (existing) existing.remove();

        // Create style element
        var style = document.createElement('style');
        style.textContent = \`
          @keyframes floww-slideIn {
            from { transform: translateX(450px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          .floww-btn {
            padding: 10px 20px;
            margin: 5px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s;
            font-size: 14px;
          }
          .floww-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
          }
          .floww-btn-primary {
            background: white;
            color: #667eea;
          }
          .floww-btn-secondary {
            background: rgba(255,255,255,0.2);
            color: white;
          }
          .floww-btn-danger {
            background: #ef4444;
            color: white;
          }
        \`;
        document.head.appendChild(style);

        // Create main container
        var container = document.createElement('div');
        container.id = 'floww-helper-ui';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 400px; animation: floww-slideIn 0.3s ease-out;';

        // Create header
        var header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: center; margin-bottom: 15px;';

        var icon = document.createElement('div');
        icon.style.cssText = 'width: 40px; height: 40px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 20px;';
        icon.textContent = '🤖';

        var headerText = document.createElement('div');
        var title = document.createElement('h3');
        title.style.cssText = 'margin: 0; font-size: 16px; font-weight: 700;';
        title.textContent = 'Floww Crawler';
        
        var subtitle = document.createElement('p');
        subtitle.style.cssText = 'margin: 3px 0 0 0; font-size: 12px; opacity: 0.9;';
        subtitle.textContent = req.type.replace(/_/g, ' ').toUpperCase();

        headerText.appendChild(title);
        headerText.appendChild(subtitle);
        header.appendChild(icon);
        header.appendChild(headerText);

        // Create message
        var message = document.createElement('p');
        message.style.cssText = 'margin: 0 0 8px 0; font-size: 14px; line-height: 1.5;';
        message.textContent = req.message;
        
        // Create keyboard shortcuts hint
        var keyboardHint = document.createElement('p');
        keyboardHint.style.cssText = 'margin: 0 0 15px 0; font-size: 11px; opacity: 0.8; font-style: italic;';
        keyboardHint.textContent = '💡 Keyboard: Ctrl+Enter (Continue) | Ctrl+S (Skip) | Ctrl+X (Stop)';

        // Create button container
        var buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';

        // Create buttons
        var continueBtn = document.createElement('button');
        continueBtn.className = 'floww-btn floww-btn-primary';
        continueBtn.textContent = '✓ Continue Crawling';
        continueBtn.onclick = function() {
          document.dispatchEvent(new CustomEvent('floww:action', { detail: 'continue' }));
        };

        var skipBtn = document.createElement('button');
        skipBtn.className = 'floww-btn floww-btn-secondary';
        skipBtn.textContent = '⏭ Skip This Page';
        skipBtn.onclick = function() {
          document.dispatchEvent(new CustomEvent('floww:action', { detail: 'skip' }));
        };

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'floww-btn floww-btn-danger';
        cancelBtn.textContent = '✕ Stop Crawling';
        cancelBtn.onclick = function() {
          document.dispatchEvent(new CustomEvent('floww:action', { detail: 'cancel' }));
        };

        buttonContainer.appendChild(continueBtn);
        buttonContainer.appendChild(skipBtn);
        buttonContainer.appendChild(cancelBtn);

        // Assemble everything
        container.appendChild(header);
        container.appendChild(message);
        container.appendChild(keyboardHint);
        container.appendChild(buttonContainer);
        document.body.appendChild(container);
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', function(e) {
          if (e.ctrlKey || e.metaKey) {
            if (e.key === 'Enter') {
              e.preventDefault();
              document.dispatchEvent(new CustomEvent('floww:action', { detail: 'continue' }));
            } else if (e.key === 's' || e.key === 'S') {
              e.preventDefault();
              document.dispatchEvent(new CustomEvent('floww:action', { detail: 'skip' }));
            } else if (e.key === 'x' || e.key === 'X') {
              e.preventDefault();
              document.dispatchEvent(new CustomEvent('floww:action', { detail: 'cancel' }));
            }
          }
        });

        // Register global callbacks
        window.__floww_continue = function() {
          document.dispatchEvent(new CustomEvent('floww:action', { detail: 'continue' }));
        };
        window.__floww_skip = function() {
          document.dispatchEvent(new CustomEvent('floww:action', { detail: 'skip' }));
        };
        window.__floww_cancel = function() {
          document.dispatchEvent(new CustomEvent('floww:action', { detail: 'cancel' }));
        };
        
        // Listen for actions
        document.addEventListener('floww:action', function(e) {
          console.log('floww:action:' + e.detail);
        });
      })(${JSON.stringify(request)});
    `;

    await this.interactivePage.evaluate(injectionCode);
  }

  /**
   * Setup console listener (call only once)
   */
  private setupConsoleListener() {
    if (!this.interactivePage || this.consoleListenerSetup) return;

    this.interactivePage.on('console', async (msg) => {
      if (msg.text().includes('floww:action')) {
        // Ignore duplicate actions if no active request
        if (!this.currentRequest || !this.resolveUserResponse) {
          return;
        }
        
        const action = msg.text().split('floww:action:')[1];
        if (action === 'continue') await this.markCompleted();
        else if (action === 'skip') await this.markSkipped();
        else if (action === 'cancel') await this.markCancelled();
      }
    });

    this.consoleListenerSetup = true;
  }

  /**
   * Extract form data from current page
   */
  private async extractFormData(): Promise<Record<string, any>> {
    if (!this.interactivePage) return {};

    return await this.interactivePage.evaluate(() => {
      const data: Record<string, any> = {};
      const inputs = document.querySelectorAll('input, select, textarea');

      inputs.forEach((input: any) => {
        const name = input.name || input.id;
        if (name && input.value) {
          data[name] = input.value;
        }
      });

      return data;
    });
  }

  /**
   * Check if currently waiting for user
   */
  isWaiting(): boolean {
    return this.isWaitingForUser;
  }

  /**
   * Get current request
   */
  getCurrentRequest(): InteractionRequest | null {
    return this.currentRequest;
  }

  /**
   * Close interactive page
   */
  async close() {
    if (this.interactivePage) {
      await this.interactivePage.close();
      this.interactivePage = null;
    }
  }
}
