import { test, expect } from '@playwright/test'

// ─── Helper ───────────────────────────────────────────────────────────────────

async function loginAs(page: import('@playwright/test').Page, email: string, senha: string) {
  await page.goto('/login')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="senha"]', senha)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|clientes|tarefas)/, { timeout: 10_000 })
}

// ─── Navegação pública (sem credenciais) ─────────────────────────────────────

test('Rota /tarefas redireciona para /login sem autenticação', async ({ page }) => {
  await page.goto('/tarefas')
  await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
})

test('Rota /hoje redireciona — para /dashboard ou /login', async ({ page }) => {
  await page.goto('/hoje')
  await expect(page).toHaveURL(/\/(login|dashboard)/, { timeout: 8_000 })
})

// ─── TaskCard hover actions ───────────────────────────────────────────────────
// Botões de ação ficam opacity-0 em repouso e opacity-100 após hover no card.
// Playwright usa hover() antes do click, ou force:true para elementos invisíveis.

test('TaskCard — botão Concluir aparece após hover', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL, 'Requer E2E_EMAIL + E2E_SENHA no ambiente')

  await loginAs(page, process.env.E2E_EMAIL!, process.env.E2E_SENHA!)
  await page.goto('/tarefas')
  await page.waitForSelector('.group', { timeout: 8_000 })

  const firstCard = page.locator('.group').first()
  await firstCard.hover()

  await expect(firstCard.getByRole('button', { name: /concluir/i }))
    .toBeVisible({ timeout: 3_000 })
})

test('TaskCard — select Reatribuir acessível com force:true', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL, 'Requer E2E_EMAIL + E2E_SENHA no ambiente')

  await loginAs(page, process.env.E2E_EMAIL!, process.env.E2E_SENHA!)
  await page.goto('/tarefas')
  await page.waitForSelector('.group', { timeout: 8_000 })

  const firstCard = page.locator('.group').first()
  // hover revela ações; force:true permite clicar mesmo com opacity-0 residual
  await firstCard.hover()
  const sel = firstCard.locator('select[aria-label*="Reatribuir"]')
  await expect(sel).toBeAttached()
  await sel.click({ force: true })
})

// ─── Criação de tarefa ────────────────────────────────────────────────────────

test('Criar tarefa com campos obrigatórios', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL, 'Requer E2E_EMAIL + E2E_SENHA no ambiente')

  await loginAs(page, process.env.E2E_EMAIL!, process.env.E2E_SENHA!)
  await page.goto('/tarefas/nova')
  await expect(page).toHaveURL(/tarefas\/nova/)

  await page.fill('input[name="titulo"]', 'Tarefa E2E — pode deletar')
  await page.selectOption('select[name="prioridade"]', 'normal')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/\/tarefas/, { timeout: 8_000 })
})
