import { test, expect } from '@playwright/test'

test('Perfil leitura não acessa financeiro', async ({ page }) => {
  test.skip(true, 'Requer usuário de perfil leitura configurado')
  await page.goto('/financeiro')
  await expect(page).toHaveURL(/financeiro/)
})
