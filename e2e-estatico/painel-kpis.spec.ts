import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/*
 * Painel: KPIs financeiros só para quem lê lançamentos, e o rótulo
 * "Atualizado há…" com o botão Atualizar. Seed: scripts/seed-emulador.mjs
 * grava dashboard_kpis + dashboard_kpis_financeiro do mês, calculados agora.
 */

async function entrar(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#senha').fill('demo1234')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
}

const SOMA_ATRASADOS = /12\.345,67/

test('admin vê os KPIs financeiros e a idade do cálculo', async ({ page }) => {
  await entrar(page, 'admin@demo.local')
  await page.goto('/dashboard')
  await expect(page.getByTestId('kpis-atualizacao')).toContainText(/Atualizado (agora|há \d+ min)/)
  await expect(page.getByRole('button', { name: 'Atualizar indicadores do painel' })).toBeEnabled()
  await expect(page.getByText(SOMA_ATRASADOS).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cobranças Vencidas' })).toBeVisible()
})

test('operacional não vê nem busca os KPIs financeiros', async ({ page }) => {
  await entrar(page, 'op@demo.local')
  const leiturasFinanceiras: string[] = []
  page.on('request', (req) => {
    const corpo = req.postData() ?? ''
    let texto = req.url() + corpo
    try { texto = decodeURIComponent(texto) } catch { /* mantém cru */ }
    if (/dashboard_kpis_financeiro|lancamentos/.test(texto)) leiturasFinanceiras.push(req.url())
  })
  await page.goto('/dashboard')
  await expect(page.getByTestId('kpis-atualizacao')).toContainText(/Atualizado (agora|há \d+ min)/)
  await expect(page.getByRole('heading', { name: 'Tarefas Vencidas' })).toBeVisible()
  await expect(page.getByText(SOMA_ATRASADOS)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Cobranças Vencidas' })).toHaveCount(0)
  // Sem a query de lançamentos negada pelas regras, o painel não acusa falha parcial.
  await expect(page.getByText('Parte do painel não pôde ser carregada.')).toHaveCount(0)
  expect(leiturasFinanceiras).toEqual([])
})
