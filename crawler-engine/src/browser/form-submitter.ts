/**
 * Form Submitter — Detects GET forms and submits them with sample data
 * to discover pages behind search, filter, and navigation forms.
 *
 * Only submits GET forms (safe, idempotent). POST forms are skipped.
 */

import type { Page } from 'playwright'

export interface FormDiscovery {
  url: string
  formAction: string
  method: string
  filledFields: Record<string, string>
}

// Sample data for common form field types
const SAMPLE_DATA: Record<string, string[]> = {
  search: ['test', 'example', 'help'],
  q: ['test', 'documentation'],
  query: ['test'],
  keyword: ['example'],
  name: ['John Doe'],
  email: ['test@example.com'],
  city: ['New York'],
  zip: ['10001'],
  country: ['US'],
  state: ['NY'],
  category: ['all'],
  type: ['all'],
  sort: ['name'],
  order: ['asc'],
  limit: ['10'],
  per_page: ['10'],
  lang: ['en'],
  locale: ['en'],
}

/**
 * Find GET forms on the page and submit them with sample data.
 * Returns newly discovered URLs.
 */
export async function submitGetForms(
  page: Page,
  options?: { maxForms?: number }
): Promise<FormDiscovery[]> {
  const maxForms = options?.maxForms ?? 3
  const discoveries: FormDiscovery[] = []
  const startUrl = page.url()

  // Extract GET forms
  const forms = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('form')).
      filter(form => {
        const method = (form.method || 'GET').toUpperCase()
        return method === 'GET'
      })
      .map((form, idx) => ({
        index: idx,
        action: form.action || window.location.href,
        method: 'GET',
        fields: Array.from(form.querySelectorAll('input, select')).map(input => ({
          name: input.getAttribute('name') || '',
          type: input.getAttribute('type') || input.tagName.toLowerCase(),
          tagName: input.tagName.toLowerCase(),
          required: input.hasAttribute('required'),
          value: (input as HTMLInputElement).value || '',
          options: input.tagName === 'SELECT'
            ? Array.from((input as HTMLSelectElement).options).map(o => o.value).filter(v => v)
            : [],
        })).filter(f => f.name),
      }))
      .filter(form => form.fields.length > 0)
      .slice(0, 5)
  })

  for (const form of forms.slice(0, maxForms)) {
    try {
      const filledFields: Record<string, string> = {}

      // Fill each field
      for (const field of form.fields) {
        if (field.type === 'hidden') continue
        if (field.type === 'submit') continue
        if (field.value) { filledFields[field.name] = field.value; continue }

        // Try to find sample data by field name
        const lowerName = field.name.toLowerCase()
        let value = ''

        // Check select options first
        if (field.options.length > 0) {
          value = field.options[0]
        } else {
          // Try to match field name to sample data
          for (const [key, values] of Object.entries(SAMPLE_DATA)) {
            if (lowerName.includes(key) || key.includes(lowerName)) {
              value = values[0]
              break
            }
          }
        }

        if (!value && field.required) {
          value = 'test' // fallback for required fields
        }

        if (value) {
          filledFields[field.name] = value

          // Actually fill the form on the page
          const selector = `form:nth-of-type(${form.index + 1}) [name="${field.name}"]`
          try {
            if (field.tagName === 'select') {
              await page.selectOption(selector, value)
            } else {
              await page.fill(selector, value)
            }
          } catch {
            // Field might not be interactable, skip
          }
        }
      }

      // Submit the form
      if (Object.keys(filledFields).length > 0) {
        const beforeUrl = page.url()

        try {
          // Try clicking submit button
          const submitSelector = `form:nth-of-type(${form.index + 1}) [type="submit"], form:nth-of-type(${form.index + 1}) button`
          const submitBtn = page.locator(submitSelector).first()
          if (await submitBtn.count() > 0) {
            await submitBtn.click({ timeout: 3000 })
          } else {
            // No submit button, press Enter
            await page.keyboard.press('Enter')
          }

          await page.waitForTimeout(2000)
          const afterUrl = page.url()

          if (afterUrl !== beforeUrl) {
            discoveries.push({
              url: afterUrl,
              formAction: form.action,
              method: form.method,
              filledFields,
            })
          }
        } catch {
          // Form submission failed
        }

        // Navigate back for next form
        if (page.url() !== startUrl) {
          await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {})
          await page.waitForTimeout(500)
        }
      }
    } catch {
      // Form processing failed, continue to next
    }
  }

  return discoveries
}
