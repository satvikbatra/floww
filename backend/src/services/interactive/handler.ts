/**
 * Interactive Handler - Human-in-the-loop for autonomous crawling
 * 
 * Provides just-in-time prompts when the crawler encounters obstacles
 * it can't handle automatically (login, forms, captcha, etc.)
 */

import * as readline from 'readline';
import { ElementData } from '../extraction/dom-parser.js';

export enum ObstacleType {
  LOGIN_REQUIRED = 'login_required',
  FORM_DATA_NEEDED = 'form_data_needed',
  CAPTCHA_DETECTED = 'captcha_detected',
  TWO_FACTOR_REQUIRED = 'two_factor_required',
  ACCESS_DENIED = 'access_denied',
  UNEXPECTED_PAGE = 'unexpected_page',
}

export interface Obstacle {
  type: ObstacleType;
  pageUrl: string;
  pageTitle: string;
  message: string;
  elements?: ElementData[];
  suggestedAction?: string;
  userInputNeeded?: boolean;
}

export interface UserResponse {
  action: 'provide_data' | 'skip' | 'abort' | 'retry';
  data?: Record<string, any>;
  continueCrawling?: boolean;
}

/**
 * InteractiveHandler - Handles user prompts when crawler gets stuck
 */
export class InteractiveHandler {
  private autoMode: boolean;
  private collectedCredentials: Record<string, string> = {};
  private collectedFormData: Record<string, string> = {};
  private rl: readline.Interface;

  constructor(autoMode: boolean = false) {
    this.autoMode = autoMode;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Handle an obstacle, with heuristics first, then user prompt
   */
  async handleObstacle(obstacle: Obstacle): Promise<UserResponse> {
    // 1. Try heuristics first
    const heuristicResponse = this.tryHeuristics(obstacle);
    if (heuristicResponse) {
      return heuristicResponse;
    }

    // 2. Auto mode - skip everything
    if (this.autoMode) {
      return { action: 'skip', continueCrawling: true };
    }

    // 3. Interactive prompt
    return await this.promptUser(obstacle);
  }

  /**
   * Try to automatically resolve the obstacle
   */
  private tryHeuristics(obstacle: Obstacle): UserResponse | null {
    if (obstacle.type === ObstacleType.FORM_DATA_NEEDED) {
      // Try to fill form with sample data
      const data: Record<string, string> = {};
      let allFilled = true;

      if (obstacle.elements) {
        for (const element of obstacle.elements) {
          if (['input', 'textarea'].includes(element.type)) {
            const sample = this.generateSampleData(element);
            if (sample) {
              data[element.selector] = sample;
            } else if (element.required) {
              allFilled = false;
            }
          }
        }
      }

      if (allFilled && Object.keys(data).length > 0) {
        return { action: 'provide_data', data, continueCrawling: true };
      }
    }

    if (obstacle.type === ObstacleType.LOGIN_REQUIRED) {
      // Check if we already collected credentials
      if (Object.keys(this.collectedCredentials).length > 0) {
        return {
          action: 'provide_data',
          data: this.collectedCredentials,
          continueCrawling: true,
        };
      }
    }

    return null;
  }

  /**
   * Generate sample data for a form field
   */
  private generateSampleData(element: ElementData): string | null {
    const FIELD_DATA: Record<string, string[]> = {
      email: ['test@example.com', 'user@company.com', 'admin@test.org'],
      name: ['John Doe', 'Jane Smith', 'Test User'],
      first_name: ['John', 'Jane', 'Alex'],
      last_name: ['Doe', 'Smith', 'Johnson'],
      username: ['testuser', 'johndoe', 'user123'],
      phone: ['+1-555-123-4567', '555-987-6543', '+44 20 1234 5678'],
      address: ['123 Main St', '456 Oak Ave', '789 Pine Rd'],
      city: ['New York', 'Los Angeles', 'Chicago'],
      company: ['Acme Corp', 'Test Company', 'Sample Inc'],
      title: ['Manager', 'Developer', 'Designer'],
      description: ['Test description for documentation purposes.'],
      password: ['TestPassword123!'],
      url: ['https://example.com'],
      date: ['2024-01-15'],
      number: ['100'],
      price: ['99.99'],
      quantity: ['1'],
      search: ['test query'],
    };

    const label = (element.label || '').toLowerCase();
    const name = (element.name || '').toLowerCase();
    const placeholder = (element.placeholder || '').toLowerCase();
    const combined = `${label} ${name} ${placeholder}`;

    for (const [key, values] of Object.entries(FIELD_DATA)) {
      if (combined.includes(key)) {
        return values[0];
      }
    }

    return 'Test Data';
  }

  /**
   * Prompt user for help
   */
  private async promptUser(obstacle: Obstacle): Promise<UserResponse> {
    console.log('\n' + '='.repeat(60));
    console.log(`⚠ ${obstacle.message}`);
    console.log('='.repeat(60));
    console.log(`Page: ${obstacle.pageTitle}`);
    console.log(`URL: ${obstacle.pageUrl}`);
    console.log();

    switch (obstacle.type) {
      case ObstacleType.LOGIN_REQUIRED:
        return await this.promptLogin(obstacle);
      case ObstacleType.FORM_DATA_NEEDED:
        return await this.promptFormData(obstacle);
      case ObstacleType.CAPTCHA_DETECTED:
        return await this.promptCaptcha(obstacle);
      case ObstacleType.TWO_FACTOR_REQUIRED:
        return await this.prompt2FA(obstacle);
      default:
        return await this.promptGeneric(obstacle);
    }
  }

  /**
   * Prompt for login credentials
   */
  private async promptLogin(obstacle: Obstacle): Promise<UserResponse> {
    console.log('This page requires login.');
    console.log();
    console.log('Options:');
    console.log('  1. Enter credentials');
    console.log('  2. I\'ll login manually (wait for me)');
    console.log('  3. Skip this page');
    console.log('  4. Stop crawling');
    console.log();

    const choice = await this.question('Choice [1-4]: ');

    if (choice === '1') {
      const email = await this.question('Email/Username: ');
      const password = await this.question('Password: ', true);

      this.collectedCredentials['email'] = email;
      this.collectedCredentials['password'] = password;

      let emailSelector: string | undefined;
      let passwordSelector: string | undefined;

      if (obstacle.elements) {
        for (const el of obstacle.elements) {
          if (el.type === 'input') {
            const labelLower = (el.label || '').toLowerCase();
            if (['email', 'user', 'login'].some((x) => labelLower.includes(x))) {
              emailSelector = el.selector;
            } else if (
              labelLower.includes('password') ||
              el.attributes?.type === 'password'
            ) {
              passwordSelector = el.selector;
            }
          }
        }
      }

      return {
        action: 'provide_data',
        data: {
          email,
          password,
          email_selector: emailSelector,
          password_selector: passwordSelector,
        },
        continueCrawling: true,
      };
    } else if (choice === '2') {
      console.log('\nWaiting for you to login manually...');
      console.log('Press Enter when you\'re logged in and ready to continue.');
      await this.question('');
      return { action: 'retry', continueCrawling: true };
    } else if (choice === '3') {
      return { action: 'skip', continueCrawling: true };
    } else {
      return { action: 'abort', continueCrawling: false };
    }
  }

  /**
   * Prompt for form data
   */
  private async promptFormData(obstacle: Obstacle): Promise<UserResponse> {
    console.log('I need data for the following required fields:');
    console.log();

    const data: Record<string, string> = {};

    if (obstacle.elements) {
      for (const element of obstacle.elements) {
        if (
          element.required &&
          ['input', 'textarea', 'select'].includes(element.type)
        ) {
          const label = element.label || element.selector;
          const currentValue = this.generateSampleData(element);

          let userInput: string;
          if (currentValue) {
            userInput = await this.question(`${label} [default: ${currentValue}]: `);
            data[element.selector] = userInput || currentValue;
          } else {
            userInput = await this.question(`${label}: `);
            if (!userInput) {
              console.log(`  Skipping required field: ${label}`);
              return { action: 'skip', continueCrawling: true };
            }
            data[element.selector] = userInput;
          }
        }
      }
    }

    return { action: 'provide_data', data, continueCrawling: true };
  }

  /**
   * Handle captcha detection
   */
  private async promptCaptcha(obstacle: Obstacle): Promise<UserResponse> {
    console.log('A CAPTCHA was detected on this page.');
    console.log();
    console.log('Options:');
    console.log('  1. I\'ll solve it manually (wait for me)');
    console.log('  2. Skip this page');
    console.log('  3. Stop crawling');
    console.log();

    const choice = await this.question('Choice [1-3]: ');

    if (choice === '1') {
      console.log('\nWaiting for you to solve the CAPTCHA...');
      console.log('Press Enter when done.');
      await this.question('');
      return { action: 'retry', continueCrawling: true };
    } else if (choice === '2') {
      return { action: 'skip', continueCrawling: true };
    } else {
      return { action: 'abort', continueCrawling: false };
    }
  }

  /**
   * Handle 2FA requirement
   */
  private async prompt2FA(obstacle: Obstacle): Promise<UserResponse> {
    console.log('Two-factor authentication is required.');
    console.log();
    const code = await this.question('Enter 2FA code (or press Enter to skip): ');

    if (code) {
      return {
        action: 'provide_data',
        data: { '2fa_code': code },
        continueCrawling: true,
      };
    } else {
      return { action: 'skip', continueCrawling: true };
    }
  }

  /**
   * Generic prompt for unknown obstacles
   */
  private async promptGeneric(obstacle: Obstacle): Promise<UserResponse> {
    console.log('Options:');
    console.log('  1. Retry');
    console.log('  2. Skip this page');
    console.log('  3. Stop crawling');
    console.log();

    const choice = await this.question('Choice [1-3]: ');

    if (choice === '1') {
      return { action: 'retry', continueCrawling: true };
    } else if (choice === '2') {
      return { action: 'skip', continueCrawling: true };
    } else {
      return { action: 'abort', continueCrawling: false };
    }
  }

  /**
   * Ask a question and wait for answer
   */
  private question(query: string, hidden: boolean = false): Promise<string> {
    return new Promise((resolve) => {
      if (hidden) {
        // For password input, we'd use a library like 'read' in Node.js
        // For now, just use regular readline
        this.rl.question(query, (answer) => {
          resolve(answer.trim());
        });
      } else {
        this.rl.question(query, (answer) => {
          resolve(answer.trim());
        });
      }
    });
  }

  /**
   * Close the readline interface
   */
  close(): void {
    this.rl.close();
  }
}

/**
 * ObstacleDetector - Detects obstacles during crawling
 */
export class ObstacleDetector {
  // Common login page patterns
  private static readonly LOGIN_PATTERNS = [
    'sign in',
    'login',
    'log in',
    'authenticate',
    'email',
    'password',
    'username',
  ];

  // Common captcha patterns
  private static readonly CAPTCHA_PATTERNS = [
    'captcha',
    'recaptcha',
    'hcaptcha',
    'cloudflare',
    "verify you're human",
    "i'm not a robot",
  ];

  /**
   * Detect if the page represents an obstacle
   */
  static detectObstacle(
    pageUrl: string,
    pageTitle: string,
    pageContent: string,
    elements: ElementData[]
  ): Obstacle | null {
    const contentLower = pageContent.toLowerCase();
    const titleLower = pageTitle.toLowerCase();

    // Check for login page
    if (this.isLoginPage(titleLower, contentLower, elements)) {
      return {
        type: ObstacleType.LOGIN_REQUIRED,
        pageUrl,
        pageTitle,
        message: 'Login page detected',
        elements,
      };
    }

    // Check for captcha
    if (this.hasCaptcha(contentLower, elements)) {
      return {
        type: ObstacleType.CAPTCHA_DETECTED,
        pageUrl,
        pageTitle,
        message: 'CAPTCHA detected on page',
      };
    }

    // Check for access denied
    if (contentLower.includes('access denied') || contentLower.includes('unauthorized')) {
      return {
        type: ObstacleType.ACCESS_DENIED,
        pageUrl,
        pageTitle,
        message: 'Access denied - may need authentication',
      };
    }

    // Check for required form fields without data
    const requiredEmpty = elements.filter(
      (el) => el.required && el.type === 'input'
    );
    if (requiredEmpty.length > 0) {
      return {
        type: ObstacleType.FORM_DATA_NEEDED,
        pageUrl,
        pageTitle,
        message: `Required form fields need data (${requiredEmpty.length} fields)`,
        elements: requiredEmpty,
      };
    }

    return null;
  }

  /**
   * Check if this looks like a login page
   */
  private static isLoginPage(
    title: string,
    content: string,
    elements: ElementData[]
  ): boolean {
    // Check title
    if (['login', 'sign in', 'authenticate'].some((p) => title.includes(p))) {
      return true;
    }

    // Check for email + password inputs
    let hasEmail = false;
    let hasPassword = false;

    for (const el of elements) {
      if (el.type === 'input') {
        const inputType = el.attributes?.type || '';
        const labelLower = (el.label || '').toLowerCase();

        if (inputType === 'password') {
          hasPassword = true;
        } else if (
          inputType === 'email' ||
          labelLower.includes('email') ||
          labelLower.includes('username')
        ) {
          hasEmail = true;
        }
      }
    }

    return hasEmail && hasPassword;
  }

  /**
   * Check for CAPTCHA elements
   */
  private static hasCaptcha(content: string, elements: ElementData[]): boolean {
    if (this.CAPTCHA_PATTERNS.some((p) => content.includes(p))) {
      return true;
    }

    for (const el of elements) {
      const attrsStr = JSON.stringify(el.attributes).toLowerCase();
      if (this.CAPTCHA_PATTERNS.some((p) => attrsStr.includes(p))) {
        return true;
      }
    }

    return false;
  }
}
