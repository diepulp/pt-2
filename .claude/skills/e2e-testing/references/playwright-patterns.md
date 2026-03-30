# Playwright Advanced Patterns Reference

Load this file when you need patterns beyond the basics covered in SKILL.md — Page Object Model, network mocking, visual regression, accessibility testing, or parallel execution with sharding.

---

## Page Object Model

Encapsulate page interactions for reuse across tests. Useful when multiple tests interact with the same UI surface.

```typescript
// pages/LoginPage.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
    readonly page: Page;
    readonly emailInput: Locator;
    readonly passwordInput: Locator;
    readonly loginButton: Locator;
    readonly errorMessage: Locator;

    constructor(page: Page) {
        this.page = page;
        this.emailInput = page.getByLabel('Email');
        this.passwordInput = page.getByLabel('Password');
        this.loginButton = page.getByRole('button', { name: 'Login' });
        this.errorMessage = page.getByRole('alert');
    }

    async goto() {
        await this.page.goto('/login');
    }

    async login(email: string, password: string) {
        await this.emailInput.fill(email);
        await this.passwordInput.fill(password);
        await this.loginButton.click();
    }

    async getErrorMessage(): Promise<string> {
        return await this.errorMessage.textContent() ?? '';
    }
}

// Usage in tests
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test('successful login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('user@example.com', 'password123');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' }))
        .toBeVisible();
});
```

---

## Network Mocking and Interception

Mock API responses to test error states and edge cases without requiring backend changes.

```typescript
// Mock API failure
test('displays error when API fails', async ({ page }) => {
    await page.route('**/api/users', route => {
        route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Internal Server Error' }),
        });
    });

    await page.goto('/users');
    await expect(page.getByText('Failed to load users')).toBeVisible();
});

// Intercept and modify requests
test('can modify API request', async ({ page }) => {
    await page.route('**/api/users', async route => {
        const request = route.request();
        const postData = JSON.parse(request.postData() || '{}');
        postData.role = 'admin';

        await route.continue({
            postData: JSON.stringify(postData),
        });
    });
});
```

---

## Waiting Strategies

Playwright auto-waits for most operations, but some patterns require explicit waits.

```typescript
// Auto-waiting with assertions (preferred)
await expect(page.getByText('Welcome')).toBeVisible();
await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();

// Wait for API response after user action
const responsePromise = page.waitForResponse(
    response => response.url().includes('/api/users') && response.status() === 200
);
await page.getByRole('button', { name: 'Load Users' }).click();
const response = await responsePromise;
const data = await response.json();
expect(data.users).toHaveLength(10);

// Wait for multiple conditions
await Promise.all([
    page.waitForURL('/success'),
    page.waitForLoadState('networkidle'),
    expect(page.getByText('Payment successful')).toBeVisible(),
]);
```

---

## Visual Regression Testing

Compare screenshots to detect unintended visual changes.

```typescript
test('homepage looks correct', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveScreenshot('homepage.png', {
        fullPage: true,
        maxDiffPixels: 100,
    });
});

test('button states', async ({ page }) => {
    await page.goto('/components');
    const button = page.getByRole('button', { name: 'Submit' });

    await expect(button).toHaveScreenshot('button-default.png');

    await button.hover();
    await expect(button).toHaveScreenshot('button-hover.png');

    await button.evaluate(el => el.setAttribute('disabled', 'true'));
    await expect(button).toHaveScreenshot('button-disabled.png');
});
```

---

## Accessibility Testing

Use `@axe-core/playwright` to catch accessibility violations automatically.

```typescript
// Install: npm install @axe-core/playwright
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('page has no accessibility violations', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page })
        .exclude('#third-party-widget')
        .analyze();

    expect(results.violations).toEqual([]);
});

test('form is accessible', async ({ page }) => {
    await page.goto('/signup');

    const results = await new AxeBuilder({ page })
        .include('form')
        .analyze();

    expect(results.violations).toEqual([]);
});
```

---

## Parallel Testing with Sharding

Split tests across CI workers for faster execution.

```typescript
// playwright.config.ts
export default defineConfig({
    projects: [
        {
            name: 'shard-1',
            use: { ...devices['Desktop Chrome'] },
            shard: { current: 1, total: 4 },
        },
        {
            name: 'shard-2',
            use: { ...devices['Desktop Chrome'] },
            shard: { current: 2, total: 4 },
        },
    ],
});

// Run in CI:
// npx playwright test --shard=1/4
// npx playwright test --shard=2/4
```

---

## Selector Best Practices

```typescript
// Avoid brittle selectors
// Bad
await page.click('.btn.btn-primary.submit-button');
await page.fill('div > form > div:nth-child(2) > input', 'text');

// Good — role-based
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByLabel('Email address').fill('user@example.com');

// Good — test ID
await page.getByTestId('email-input').fill('user@example.com');
```
