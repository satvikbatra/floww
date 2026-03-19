/**
 * Screenshot Capture - Advanced screenshot utilities with annotations
 */

import { Page } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

export interface ScreenshotOptions {
  fullPage?: boolean;
  quality?: number;
  type?: 'png' | 'jpeg';
  highlightSelectors?: string[];
  annotations?: Array<{ x: number; y: number; text: string }>;
}

/**
 * ScreenshotCapture - Handles advanced screenshot capture with annotations
 */
export class ScreenshotCapture {
  private outputDir: string;

  constructor(outputDir: string = './storage/screenshots') {
    this.outputDir = outputDir;
  }

  /**
   * Capture full page screenshot
   */
  async captureFullPage(page: Page, name: string): Promise<string> {
    await this.ensureDir(this.outputDir);
    const path = join(this.outputDir, `${name}.png`);
    await page.screenshot({ path, fullPage: true });
    return path;
  }

  /**
   * Capture viewport screenshot
   */
  async captureViewport(page: Page, name: string): Promise<string> {
    await this.ensureDir(this.outputDir);
    const path = join(this.outputDir, `${name}.png`);
    await page.screenshot({ path, fullPage: false });
    return path;
  }

  /**
   * Capture specific element
   */
  async captureElement(page: Page, selector: string, name: string): Promise<string | null> {
    try {
      const element = await page.locator(selector).first();
      const count = await page.locator(selector).count();
      
      if (count === 0) {
        return null;
      }

      await this.ensureDir(this.outputDir);
      const path = join(this.outputDir, `${name}.png`);
      await element.screenshot({ path });
      return path;
    } catch (error) {
      return null;
    }
  }

  /**
   * Capture with highlighted elements
   */
  async captureWithHighlights(
    page: Page,
    name: string,
    selectors: string[],
    options?: ScreenshotOptions
  ): Promise<string> {
    // Inject highlight styles
    await this.injectHighlightStyles(page, selectors);

    // Take screenshot
    await this.ensureDir(this.outputDir);
    const path = join(this.outputDir, `${name}.png`);
    await page.screenshot({
      path,
      fullPage: options?.fullPage ?? true,
      type: options?.type ?? 'png',
    });

    // Remove highlights
    await this.removeHighlightStyles(page, selectors);

    return path;
  }

  /**
   * Capture with annotations
   */
  async captureWithAnnotations(
    page: Page,
    name: string,
    annotations: Array<{ selector: string; label: string }>,
    options?: ScreenshotOptions
  ): Promise<string> {
    // Inject annotation labels
    await page.evaluate((anns) => {
      anns.forEach((ann, idx) => {
        const elements = document.querySelectorAll(ann.selector);
        elements.forEach((el) => {
          const label = document.createElement('div');
          label.textContent = ann.label;
          label.style.cssText = `
            position: absolute;
            background: #ff6b35;
            color: white;
            padding: 4px 8px;
            font-size: 12px;
            font-weight: bold;
            border-radius: 4px;
            z-index: 999999;
            pointer-events: none;
            font-family: monospace;
          `;
          label.id = `floww-annotation-${idx}`;

          const rect = el.getBoundingClientRect();
          label.style.top = `${rect.top - 25}px`;
          label.style.left = `${rect.left}px`;

          document.body.appendChild(label);

          // Highlight element
          (el as HTMLElement).style.outline = '3px solid #ff6b35';
          (el as HTMLElement).style.outlineOffset = '2px';
        });
      });
    }, annotations);

    // Take screenshot
    await this.ensureDir(this.outputDir);
    const path = join(this.outputDir, `${name}.png`);
    await page.screenshot({
      path,
      fullPage: options?.fullPage ?? true,
      type: options?.type ?? 'png',
    });

    // Remove annotations
    await page.evaluate((anns) => {
      anns.forEach((ann, idx) => {
        const label = document.getElementById(`floww-annotation-${idx}`);
        if (label) label.remove();

        const elements = document.querySelectorAll(ann.selector);
        elements.forEach((el) => {
          (el as HTMLElement).style.outline = '';
          (el as HTMLElement).style.outlineOffset = '';
        });
      });
    }, annotations);

    return path;
  }

  /**
   * Inject highlight styles for elements
   */
  private async injectHighlightStyles(page: Page, selectors: string[]): Promise<void> {
    await page.evaluate((sels) => {
      sels.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          (el as HTMLElement).style.outline = '3px solid #4CAF50';
          (el as HTMLElement).style.outlineOffset = '3px';
          (el as HTMLElement).style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
        });
      });
    }, selectors);
  }

  /**
   * Remove highlight styles
   */
  private async removeHighlightStyles(page: Page, selectors: string[]): Promise<void> {
    await page.evaluate((sels) => {
      sels.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          (el as HTMLElement).style.outline = '';
          (el as HTMLElement).style.outlineOffset = '';
          (el as HTMLElement).style.backgroundColor = '';
        });
      });
    }, selectors);
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  /**
   * Generate unique screenshot name
   */
  generateName(prefix: string = 'screenshot'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${prefix}-${timestamp}-${random}`;
  }
}
