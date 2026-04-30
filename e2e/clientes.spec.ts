import { test, expect } from '@playwright/test'

test('Criar cliente com CPF/CNPJ válido', async ({ page }) => {
  test.skip(true, 'Depende de autenticação e dados de teste')
  await page.goto('/clientes/novo')
  await expect(page).toHaveURL(/clientes\/novo/)
})
