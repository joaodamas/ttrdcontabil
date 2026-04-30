import { test, expect } from '@playwright/test'

async function loginAs(page: import('@playwright/test').Page, email: string, senha: string) {
  await page.goto('/login')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="senha"]', senha)
  await page.click('button[type="submit"]')
}

test('Perfil leitura não acessa financeiro', async ({ page }) => {
  test.skip(true, 'Requer usuário leitura seedado no ambiente E2E')
  await loginAs(page, 'leitura@ttrd.com', 'senha123')
  await page.goto('/financeiro')
  await expect(page).not.toHaveURL(/\/financeiro$/)
})

test('Perfil fiscal não acessa admin', async ({ page }) => {
  test.skip(true, 'Requer usuário fiscal seedado no ambiente E2E')
  await loginAs(page, 'fiscal@ttrd.com', 'senha123')
  await page.goto('/admin')
  await expect(page).not.toHaveURL(/\/admin$/)
})
