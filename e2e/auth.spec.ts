import { test, expect } from '@playwright/test'

test('Login e acesso ao cockpit', async ({ page }) => {
  test.skip(true, 'Depende de credenciais reais/seed do ambiente')
  await page.goto('/login')
  await expect(page).toHaveURL(/dashboard/)
})
