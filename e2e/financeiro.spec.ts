import { test, expect } from '@playwright/test'

test('Criar lançamento e exibir na fila de cobrança', async ({ page }) => {
  test.skip(true, 'Depende de autenticação e fixtures de cliente')
  await page.goto('/financeiro/novo')
  await expect(page).toHaveURL(/financeiro\/novo/)
})
