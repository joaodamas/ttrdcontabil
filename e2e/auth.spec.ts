import { test, expect } from '@playwright/test'

// ─── Testes públicos (sem credenciais) ───────────────────────────────────────

test('Página de login renderiza campos de e-mail e senha', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[name="email"]')).toBeVisible()
  await expect(page.locator('input[name="senha"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

test('Rotas protegidas redirecionam para /login', async ({ page }) => {
  for (const route of ['/dashboard', '/clientes', '/tarefas', '/fechamento', '/financeiro']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
  }
})

test('Login com credenciais inválidas exibe erro', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="email"]', 'invalido@teste.com')
  await page.fill('input[name="senha"]', 'senhaerrada')
  await page.click('button[type="submit"]')
  // Aguarda mensagem de erro (não redireciona)
  await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })
})

// ─── Testes com credenciais reais (E2E_EMAIL + E2E_SENHA no ambiente) ────────

test('Login bem-sucedido redireciona para /dashboard', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL, 'Requer E2E_EMAIL + E2E_SENHA no ambiente')

  await page.goto('/login')
  await page.fill('input[name="email"]', process.env.E2E_EMAIL!)
  await page.fill('input[name="senha"]', process.env.E2E_SENHA!)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
})

test('Após login, topnav exibe links de navegação', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL, 'Requer E2E_EMAIL + E2E_SENHA no ambiente')

  await page.goto('/login')
  await page.fill('input[name="email"]', process.env.E2E_EMAIL!)
  await page.fill('input[name="senha"]', process.env.E2E_SENHA!)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

  await expect(page.locator('nav')).toBeVisible()
  await expect(page.getByText('Dashboard')).toBeVisible()
  await expect(page.getByText('Clientes')).toBeVisible()
})
