/**
 * UI Extraction Layer - DOM parsing and element extraction
 */

import { Page as PlaywrightPage } from 'playwright';

export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementData {
  type: string;
  label: string;
  selector: string;
  name?: string;
  id?: string;
  placeholder?: string;
  required?: boolean;
  value?: string;
  position: Position;
  attributes?: Record<string, any>;
}

export interface PageStructure {
  title: string;
  url: string;
  headings: Array<{ level: number; text: string }>;
  paragraphs: string[];
  meta: {
    description?: string;
    keywords?: string;
  };
  accessibility?: any;
}

/**
 * DOMParser - Extracts page structure and metadata
 */
export class DOMParser {
  async extractPageStructure(page: PlaywrightPage): Promise<PageStructure> {
    const structure = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        headings: Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => ({
          level: parseInt(h.tagName.substring(1)),
          text: h.textContent?.trim() || '',
        })),
        paragraphs: Array.from(document.querySelectorAll('p'))
          .map((p) => p.textContent?.trim().substring(0, 200) || '')
          .filter((t) => t.length > 20)
          .slice(0, 10),
        meta: {
          description: document.querySelector('meta[name="description"]')?.getAttribute('content') || undefined,
          keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content') || undefined,
        },
      };
    });
    return structure;
  }

  async extractAccessibilityTree(page: PlaywrightPage): Promise<any> {
    const tree = await page.evaluate(() => {
      function getAriaTree(element: Element, depth = 0): any {
        if (depth > 5) return null;

        const role = element.getAttribute('role') || element.tagName.toLowerCase();
        const label =
          element.getAttribute('aria-label') ||
          element.getAttribute('alt') ||
          (element.textContent?.substring(0, 100) || '');

        const node: any = {
          role: role,
          label: label?.trim(),
          children: [],
        };

        const children = element.children;
        for (let i = 0; i < Math.min(children.length, 20); i++) {
          const childNode = getAriaTree(children[i], depth + 1);
          if (childNode) node.children.push(childNode);
        }

        return node;
      }

      return getAriaTree(document.body);
    });
    return tree;
  }
}

/**
 * FormExtractor - Extracts forms and their inputs
 */
export class FormExtractor {
  async extractForms(page: PlaywrightPage, pageId: string): Promise<ElementData[]> {
    const formsData = await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      const results: any[] = [];

      forms.forEach((form, formIndex) => {
        const inputs = form.querySelectorAll('input, select, textarea');
        const formElements: any[] = [];

        inputs.forEach((input: any, inputIndex) => {
          const label =
            document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() ||
            input.getAttribute('aria-label') ||
            input.getAttribute('placeholder') ||
            input.name ||
            'Unnamed Field';

          let elementType = 'input';
          if (input.tagName === 'SELECT') elementType = 'select';
          else if (input.tagName === 'TEXTAREA') elementType = 'textarea';
          else if (input.type === 'checkbox') elementType = 'checkbox';
          else if (input.type === 'radio') elementType = 'radio';

          const rect = input.getBoundingClientRect();

          formElements.push({
            type: elementType,
            label: label,
            name: input.name || '',
            id: input.id || '',
            placeholder: input.placeholder || '',
            required: input.required,
            value: input.value || '',
            selector: input.id
              ? '#' + input.id
              : input.name
              ? `[name="${input.name}"]`
              : `form:nth-of-type(${formIndex + 1}) ${input.tagName.toLowerCase()}:nth-of-type(${inputIndex + 1})`,
            position: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            attributes: {
              type: input.type || '',
              maxlength: input.maxLength || '',
              pattern: input.pattern || '',
            },
          });
        });

        const buttons = form.querySelectorAll('button, input[type="submit"]');
        buttons.forEach((btn: any, btnIndex) => {
          const rect = btn.getBoundingClientRect();
          formElements.push({
            type: 'button',
            label: btn.textContent?.trim() || btn.value || 'Submit',
            selector: btn.id
              ? '#' + btn.id
              : `form:nth-of-type(${formIndex + 1}) button:nth-of-type(${btnIndex + 1})`,
            position: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
          });
        });

        results.push(...formElements);
      });

      return results;
    });

    return formsData;
  }
}

/**
 * ButtonExtractor - Extracts interactive buttons
 */
export class ButtonExtractor {
  async extractButtons(page: PlaywrightPage, pageId: string): Promise<ElementData[]> {
    const buttonsData = await page.evaluate(() => {
      const buttons = document.querySelectorAll(
        'button, [role="button"], input[type="submit"], input[type="button"]'
      );
      const results: any[] = [];

      buttons.forEach((btn: any, index) => {
        if (btn.closest('form')) return;

        const rect = btn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        results.push({
          type: 'button',
          label:
            btn.textContent?.trim() || btn.value || btn.getAttribute('aria-label') || 'Button',
          selector: btn.id
            ? '#' + btn.id
            : btn.getAttribute('aria-label')
            ? `${btn.tagName.toLowerCase()}[aria-label="${btn.getAttribute('aria-label')}"]`
            : `${btn.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      });

      return results;
    });

    return buttonsData;
  }
}

/**
 * LinkExtractor - Extracts navigation links
 */
export class LinkExtractor {
  async extractLinks(page: PlaywrightPage, pageId: string): Promise<ElementData[]> {
    const linksData = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href]');
      const results: any[] = [];

      links.forEach((link: any, index) => {
        const rect = link.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const href = link.getAttribute('href');
        if (
          !href ||
          href.startsWith('javascript:') ||
          href.startsWith('mailto:') ||
          href === '#'
        )
          return;

        results.push({
          type: 'link',
          label:
            link.textContent?.trim() ||
            link.getAttribute('aria-label') ||
            link.getAttribute('title') ||
            'Link',
          selector: link.id ? '#' + link.id : `a[href="${href}"]`,
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          attributes: {
            href: href,
            target: link.target,
          },
        });
      });

      return results.slice(0, 50);
    });

    return linksData;
  }
}

/**
 * UIExtractor - Main extraction orchestrator
 */
export class UIExtractor {
  private domParser: DOMParser;
  private formExtractor: FormExtractor;
  private buttonExtractor: ButtonExtractor;
  private linkExtractor: LinkExtractor;

  constructor() {
    this.domParser = new DOMParser();
    this.formExtractor = new FormExtractor();
    this.buttonExtractor = new ButtonExtractor();
    this.linkExtractor = new LinkExtractor();
  }

  async extractAll(page: PlaywrightPage): Promise<{
    structure: PageStructure;
    elements: ElementData[];
  }> {
    const structure = await this.domParser.extractPageStructure(page);
    const accessibility = await this.domParser.extractAccessibilityTree(page);
    structure.accessibility = accessibility;

    const forms = await this.formExtractor.extractForms(page, 'page-id');
    const buttons = await this.buttonExtractor.extractButtons(page, 'page-id');
    const links = await this.linkExtractor.extractLinks(page, 'page-id');

    const elements = [...forms, ...buttons, ...links];

    return { structure, elements };
  }

  getDOMParser(): DOMParser {
    return this.domParser;
  }

  getFormExtractor(): FormExtractor {
    return this.formExtractor;
  }

  getButtonExtractor(): ButtonExtractor {
    return this.buttonExtractor;
  }

  getLinkExtractor(): LinkExtractor {
    return this.linkExtractor;
  }
}
