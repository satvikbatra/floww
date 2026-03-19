/**
 * Authentication Handler - Auto-login for protected SaaS applications
 */

import { BrowserContext, Page } from 'playwright';

export enum AuthType {
  NONE = 'none',
  EMAIL_PASSWORD = 'email_password',
  SESSION = 'session',
  OAUTH = 'oauth',
}

export interface AuthConfig {
  type: AuthType;
  email?: string;
  password?: string;
  sessionCookies?: Record<string, string>;
  loginUrl?: string;
  domain?: string;
}

/**
 * AuthHandler - Manages authentication for crawling sessions
 */
export class AuthHandler {
  private config: AuthConfig;

  constructor(config?: AuthConfig) {
    this.config = config || { type: AuthType.NONE };
  }

  /**
   * Authenticate with the application
   */
  async authenticate(context: BrowserContext, page: Page, loginUrl?: string): Promise<boolean> {
    if (this.config.type === AuthType.NONE) {
      return true;
    }

    if (this.config.type === AuthType.SESSION) {
      return await this.injectSession(context);
    }

    if (this.config.type === AuthType.EMAIL_PASSWORD) {
      return await this.loginWithCredentials(page, loginUrl);
    }

    return false;
  }

  /**
   * Inject session cookies for authentication
   */
  private async injectSession(context: BrowserContext): Promise<boolean> {
    if (!this.config.sessionCookies) {
      return false;
    }

    const cookies = Object.entries(this.config.sessionCookies).map(([name, value]) => ({
      name,
      value,
      domain: this.config.domain || '',
      path: '/',
    }));

    await context.addCookies(cookies);
    return true;
  }

  /**
   * Auto-login with email/password credentials
   */
  private async loginWithCredentials(page: Page, loginUrl?: string): Promise<boolean> {
    if (!this.config.email || !this.config.password) {
      return false;
    }

    if (loginUrl || this.config.loginUrl) {
      await page.goto(loginUrl || this.config.loginUrl!);
    }

    await page.waitForLoadState('networkidle');

    // Try to find email/username field
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[placeholder*="email" i]',
      'input[id*="email" i]',
      '#email',
      '#username',
    ];

    let emailField = null;
    for (const selector of emailSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        emailField = page.locator(selector).first();
        break;
      }
    }

    if (!emailField) {
      return false;
    }

    await emailField.fill(this.config.email);

    // Try to find password field
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="password" i]',
      '#password',
    ];

    let passwordField = null;
    for (const selector of passwordSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        passwordField = page.locator(selector).first();
        break;
      }
    }

    if (!passwordField) {
      return false;
    }

    await passwordField.fill(this.config.password);

    // Try to find submit button
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      '[role="button"]:has-text("Login")',
    ];

    let submitButton = null;
    for (const selector of submitSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        submitButton = page.locator(selector).first();
        break;
      }
    }

    if (!submitButton) {
      // Try pressing Enter
      await passwordField.press('Enter');
    } else {
      await submitButton.click();
    }

    // Wait for navigation
    try {
      await page.waitForNavigation({ timeout: 10000 });
      return true;
    } catch (error) {
      // Navigation didn't happen, check if we're logged in anyway
      return await this.isAuthenticated(page);
    }
  }

  /**
   * Check if we're currently authenticated
   */
  async isAuthenticated(page: Page): Promise<boolean> {
    // Check for common auth indicators
    const indicators = [
      'button:has-text("Logout")',
      'button:has-text("Sign out")',
      'a:has-text("Logout")',
      '[data-testid*="logout"]',
      '.user-menu',
      '.profile-menu',
    ];

    for (const selector of indicators) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Save session cookies for future use
   */
  async saveSession(context: BrowserContext): Promise<Record<string, string>> {
    const cookies = await context.cookies();
    const sessionCookies: Record<string, string> = {};

    // Filter for session-related cookies
    const sessionKeywords = ['session', 'auth', 'token', 'jwt', 'sid'];

    cookies.forEach((cookie) => {
      const lowerName = cookie.name.toLowerCase();
      if (sessionKeywords.some((keyword) => lowerName.includes(keyword))) {
        sessionCookies[cookie.name] = cookie.value;
      }
    });

    return sessionCookies;
  }

  /**
   * Clear authentication
   */
  async clearAuth(context: BrowserContext): Promise<void> {
    await context.clearCookies();
  }
}
