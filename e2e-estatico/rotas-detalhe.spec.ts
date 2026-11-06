import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/*
 * Roda contra o build estático + emuladores com scripts/seed-emulador.mjs
 * (ver playwright.estatico.config.ts e `npm run test:e2e:estatico`).
 *
 * Regressão: no static export as rotas /tarefas/<id>, /competencias/<id>,
 * /fiscal/<id>, /ir/<id> (e /editar) são servidas pelo rewrite do firebase.json
 * com a página do id "placeholder"; useParams() devolvia "placeholder" e toda
 * tela de detalhe abria "não encontrado" em produção.
 */

async function entrar(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#senha').fill('demo1234')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
}

// Mesma regra de id do seed: competência do mês corrente do primeiro cliente.
function idCompetenciaAtual() {
  const hoje = new Date()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  return `cli-01_cli-01-contab_${hoje.getFullYear()}_${mes}`
}

test.describe('detalhe e edição abrem com o id real da URL (admin)', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin@demo.local')
  })

  test('/tarefas/<id> e /tarefas/<id>/editar', async ({ page }) => {
    await page.goto('/tarefas/tar-1')
    await expect(page.getByRole('heading', { name: /Apurar DAS — Padaria Bom/ })).toBeVisible()

    await page.goto('/tarefas/tar-1/editar')
    await expect(page.locator('input[name="titulo"]')).toHaveValue(/Apurar DAS — Padaria Bom/)
  })

  test('/competencias/<id> e /competencias/<id>/editar', async ({ page }) => {
    const id = idCompetenciaAtual()
    await page.goto(`/competencias/${id}`)
    await expect(page.getByText('Padaria Bom Grão Ltda').first()).toBeVisible()
    await expect(page.getByText(/não encontrad/i)).toHaveCount(0)

    await page.goto(`/competencias/${id}/editar`)
    await expect(page.getByText(/não encontrad/i)).toHaveCount(0)
    await expect(page.locator('form')).toBeVisible()
  })

  test('/fiscal/<id> acende "Histórico de NFS-e" na barra lateral', async ({ page }) => {
    await page.goto('/fiscal/nf-1')
    await expect(page.getByRole('heading', { name: 'NFS-e 2400' })).toBeVisible()
    const historico = page.getByRole('link', { name: 'Histórico de NFS-e' }).first()
    await expect(historico).toHaveAttribute('aria-current', 'page')
  })

  test('/ir/<id> e /ir/<id>/editar', async ({ page }) => {
    await page.goto('/ir/ir-1')
    await expect(page.getByText('Padaria Bom Grão Ltda').first()).toBeVisible()
    await expect(page.getByText(/não encontrad/i)).toHaveCount(0)

    await page.goto('/ir/ir-1/editar')
    await expect(page.getByText(/não encontrad/i)).toHaveCount(0)
    await expect(page.locator('form')).toBeVisible()
  })
})

test.describe('perfil financeiro: só o que ele pode usar', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'fin@demo.local')
  })

  test('vê a nota, mas não emite, consulta nem cancela', async ({ page }) => {
    await page.goto('/fiscal/nf-2')
    await expect(page.getByRole('heading', { name: 'NFS-e 2401' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancelar' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Consultar' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Nova NFS-e' })).toHaveCount(0)

    await page.goto('/fiscal')
    await expect(page.getByRole('heading', { name: 'NFS-e', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Emitir em lote|Preparar mês|Nova NFS-e/ })).toHaveCount(0)
  })

  test('tela sem acesso redireciona com aviso', async ({ page }) => {
    await page.goto('/tarefas')
    await expect(page.getByText('Você não tem acesso a Tarefas.')).toBeVisible()
    await expect(page).not.toHaveURL(/\/tarefas/)
  })

  test('ficha do cliente: falta de permissão aparece como "Sem acesso", sem "Configurar NFS-e"', async ({ page }) => {
    // Financeiro lê as NFS-e, mas as regras negam clientes_fiscal a ele.
    await page.goto('/clientes?cliente=cli-01')
    const ficha = page.getByRole('dialog')
    await expect(ficha.getByText('Padaria Bom Grão Ltda').first()).toBeVisible()
    await expect(ficha.getByRole('tab', { name: /Operacional/ })).toHaveCount(0)
    await ficha.getByRole('tab', { name: /Fiscal/ }).click()
    await expect(ficha.getByText('Sem acesso a este módulo')).toBeVisible()
    await expect(ficha.getByText('Sem configuração fiscal')).toHaveCount(0)
    await expect(ficha.getByRole('button', { name: /Configurar/ })).toHaveCount(0)
    await expect(ficha.getByRole('button', { name: /Emitir/ })).toHaveCount(0)

    await page.goto('/clientes/cli-01')
    await page.getByRole('tab', { name: /Fiscal/ }).click()
    await expect(page.getByText('Sem acesso a este módulo')).toBeVisible()
    await expect(page.getByRole('button', { name: /Configurar/ })).toHaveCount(0)
  })

  test('financeiro sem as ações e colunas do WhatsApp (módulo removido)', async ({ page }) => {
    await page.goto('/financeiro')
    await expect(page.getByText('Honorários').first()).toBeVisible()
    await expect(page.getByText('Status WhatsApp')).toHaveCount(0)
    await expect(page.getByText('Próxima ação')).toHaveCount(0)
  })

  test('sidebar mostra o rótulo do perfil', async ({ page }) => {
    await page.goto('/hoje')
    await expect(page.getByText('Financeiro', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('financeiro', { exact: true })).toHaveCount(0)
  })
})
