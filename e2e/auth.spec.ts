import { test, expect } from '@playwright/test'

// ─── Testes públicos (sem credenciais) ───────────────────────────────────────

test('Página de login renderiza campos de e-mail e senha', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[name="email"]')).toBeVisible()
  await expect(page.locator('input[name="senha"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

test('Rotas protegidas redirecionam para /login guardando a rota de origem', async ({ page }) => {
  // No dev server cada rota compila na primeira visita.
  test.setTimeout(180_000)
  for (const route of ['/hoje', '/clientes', '/tarefas', '/fechamento', '/financeiro', '/relatorios/carteira']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 })
    expect(new URL(page.url()).searchParams.get('from')).toBe(route)
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

test('Login bem-sucedido redireciona para /hoje', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL, 'Requer E2E_EMAIL + E2E_SENHA no ambiente')

  await page.goto('/login')
  await page.fill('input[name="email"]', process.env.E2E_EMAIL!)
  await page.fill('input[name="senha"]', process.env.E2E_SENHA!)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/hoje/, { timeout: 10_000 })
})

test('Após login, a sidebar exibe links de navegação', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL, 'Requer E2E_EMAIL + E2E_SENHA no ambiente')

  await page.goto('/login')
  await page.fill('input[name="email"]', process.env.E2E_EMAIL!)
  await page.fill('input[name="senha"]', process.env.E2E_SENHA!)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/hoje/, { timeout: 10_000 })

  const sidebar = page.locator('aside nav')
  await expect(sidebar).toBeVisible()
  await expect(sidebar.getByRole('link', { name: /Clientes/ })).toBeVisible()
})
