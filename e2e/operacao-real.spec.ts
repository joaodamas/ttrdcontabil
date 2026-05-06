import { expect, test, type Page } from '@playwright/test'

const E2E_EMAIL = process.env.E2E_EMAIL
const E2E_SENHA = process.env.E2E_SENHA
const E2E_CLIENTE_ID = process.env.E2E_CLIENTE_ID
const E2E_CLIENTE_NOME = process.env.E2E_CLIENTE_NOME

async function login(page: Page) {
  test.skip(!E2E_EMAIL || !E2E_SENHA, 'Requer E2E_EMAIL + E2E_SENHA com usuário real do ambiente')
  await page.goto('/login')
  await page.fill('input[name="email"]', E2E_EMAIL!)
  await page.fill('input[name="senha"]', E2E_SENHA!)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(hoje|dashboard|clientes|tarefas)/, { timeout: 12_000 })
}

test.describe('Operação com fixtures reais', () => {
  test('abre as telas críticas autenticadas sem cair em erro global', async ({ page }) => {
    await login(page)

    for (const route of ['/hoje', '/clientes', '/competencias', '/tarefas', '/fechamento', '/financeiro', '/fiscal', '/ir']) {
      await page.goto(route)
      await expect(page.getByText(/algo deu errado|erro inesperado/i)).toHaveCount(0)
      await expect(page.locator('body')).toBeVisible()
    }
  })

  test('cliente real abre Cliente 360 e fiscal do cliente', async ({ page }) => {
    test.skip(!E2E_CLIENTE_ID, 'Requer E2E_CLIENTE_ID de um cliente real')
    await login(page)

    await page.goto(`/clientes/${E2E_CLIENTE_ID}`)
    await expect(page.getByText(/algo deu errado|erro inesperado/i)).toHaveCount(0)
    if (E2E_CLIENTE_NOME) {
      await expect(page.getByText(E2E_CLIENTE_NOME, { exact: false })).toBeVisible({ timeout: 10_000 })
    }

    await page.goto(`/clientes/${E2E_CLIENTE_ID}/fiscal`)
    await expect(page.getByText(/configura|certificado|nfs-e/i)).toBeVisible({ timeout: 10_000 })
  })

  test('painel fiscal mostra prontidão e fluxo de rascunhos', async ({ page }) => {
    await login(page)

    await page.goto('/fiscal')
    await expect(page.getByText('Prontidão para emissão recorrente')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /preparar mês/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /emitir em lote/i })).toBeVisible()
  })

  test('telas de criação principais carregam formulários sem submeter dados', async ({ page }) => {
    await login(page)

    for (const route of ['/clientes/novo', '/competencias/nova', '/tarefas/nova', '/financeiro/novo', '/fiscal/emitir', '/ir/nova']) {
      await page.goto(route)
      await expect(page.getByText(/algo deu errado|erro inesperado/i)).toHaveCount(0)
      await expect(page.locator('form, input, textarea, button[type="submit"]').first()).toBeVisible({ timeout: 10_000 })
    }
  })
})
