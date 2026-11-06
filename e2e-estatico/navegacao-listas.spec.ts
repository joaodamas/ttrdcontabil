import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/*
 * Navegação consistente nas listas, contra o build estático + emuladores
 * (seed: scripts/seed-emulador.mjs). Ver `npm run test:e2e:estatico`.
 */

async function entrar(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#senha').fill('demo1234')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
}

/** Primeira linha clicável visível; clica numa célula sem link/botão. */
async function clicarPrimeiraLinha(page: Page, celula: number) {
  const linha = page.locator('tr[data-linha-clicavel]:visible').first()
  await expect(linha).toBeVisible()
  const destino = await linha.getAttribute('data-href')
  expect(destino).toBeTruthy()
  await linha.locator('td').nth(celula).click()
  await page.waitForURL((url) => url.pathname === destino)
  return destino!
}

test.describe('linha inteira abre o detalhe (admin)', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin@demo.local')
  })

  test('tarefa', async ({ page }) => {
    await page.goto('/tarefas')
    // Célula "Prioridade" (sem link): antes só o título era clicável.
    await clicarPrimeiraLinha(page, 2)
    await expect(page).toHaveURL(/\/tarefas\/tar-\d+$/)
    await expect(page.getByText(/não encontrad/i)).toHaveCount(0)
  })

  test('competência (clique e Enter)', async ({ page }) => {
    await page.goto('/competencias')
    await clicarPrimeiraLinha(page, 3)
    await expect(page).toHaveURL(/\/competencias\/cli-\d+_/)
    await expect(page.getByText(/não encontrad/i)).toHaveCount(0)

    // Teclado: foco na linha + Enter.
    await page.goto('/competencias')
    const linha = page.locator('tr[data-linha-clicavel]:visible').first()
    const destino = await linha.getAttribute('data-href')
    await linha.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL((url) => url.pathname === destino)
  })

  test('nota do histórico de NFS-e', async ({ page }) => {
    await page.goto('/fiscal/historico')
    // Célula "Tomador".
    await clicarPrimeiraLinha(page, 3)
    await expect(page).toHaveURL(/\/fiscal\/nf-\d+$/)
    await expect(page.getByRole('heading', { name: /NFS-e \d+/ })).toBeVisible()
  })

  test('declaração de IR', async ({ page }) => {
    await page.goto('/ir')
    await clicarPrimeiraLinha(page, 2)
    await expect(page).toHaveURL(/\/ir\/ir-\d+$/)
    await expect(page.getByText(/não encontrad/i)).toHaveCount(0)
  })

  test('botão dentro da linha não abre a linha', async ({ page }) => {
    await page.goto('/fiscal/historico')
    const linha = page.locator('tr[data-linha-clicavel]:visible').first()
    await linha.getByRole('button', { name: 'Mais ações' }).click()
    await expect(page.getByRole('menuitem', { name: 'Ver logs de emissão' })).toBeVisible()
    await expect(page).toHaveURL(/\/fiscal\/historico/)
  })
})

test.describe('chips de filtro', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin@demo.local')
  })

  test('clienteId em Tarefas aparece com o nome e sai com um clique', async ({ page }) => {
    await page.goto('/tarefas?clienteId=cli-01')
    const chip = page.locator('[data-filtro-ativo="clienteId"]')
    await expect(chip).toContainText('Padaria Bom Grão Ltda')
    await expect(page.locator('tr[data-linha-clicavel]:visible').first()).toContainText('Padaria')

    await chip.getByRole('link', { name: 'Remover filtro Cliente' }).click()
    await expect(page).not.toHaveURL(/clienteId=/)
    await expect(page.locator('[data-filtro-ativo="clienteId"]')).toHaveCount(0)
  })

  test('clienteId em Financeiro (antes invisível)', async ({ page }) => {
    await page.goto('/financeiro?clienteId=cli-02')
    await expect(page.locator('[data-filtro-ativo="clienteId"]')).toContainText('Oficina Mecânica Torque ME')
  })

  test('Competências do cliente sem mês: todos os meses, e "Nova competência" herda o cliente', async ({ page }) => {
    await page.goto('/competencias?clienteId=cli-01')
    await expect(page.locator('[data-filtro-ativo="clienteId"]')).toContainText('Padaria Bom Grão Ltda')
    await expect(page.locator('[data-seletor-mes]')).toContainText('Todos os meses')
    // O seed cria o mês atual e o anterior para cada cliente.
    await expect(page.locator('tr[data-linha-clicavel]:visible')).toHaveCount(2)
    await expect(page.getByRole('link', { name: 'Nova competência' })).toHaveAttribute('href', '/competencias/nova?clienteId=cli-01')
  })
})

test.describe('histórico de NFS-e', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin@demo.local')
  })

  test('filtra por mês com o seletor', async ({ page }) => {
    await page.goto('/fiscal/historico')
    await expect(page.locator('tr[data-linha-clicavel]:visible').first()).toBeVisible()
    const todas = await page.locator('tr[data-linha-clicavel]:visible').count()
    await page.getByRole('link', { name: 'Filtrar por mês' }).click()

    const hoje = new Date()
    const mes = hoje.getMonth() + 1
    await expect(page).toHaveURL(new RegExp(`mes=${mes}&ano=${hoje.getFullYear()}|ano=${hoje.getFullYear()}&mes=${mes}`))
    await expect(page.locator('[data-filtro-ativo="periodo"]')).toBeVisible()
    const doMes = page.locator('tr[data-linha-clicavel]:visible')
    const n = await doMes.count()
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThan(todas)
    // Coluna "Emissão" (5ª) só com datas do mês escolhido.
    const sufixo = `/${String(mes).padStart(2, '0')}/${hoje.getFullYear()}`
    for (const data of await doMes.locator('td:nth-child(5)').allInnerTexts()) {
      expect(data.trim().endsWith(sufixo)).toBe(true)
    }

    await page.getByRole('link', { name: 'Mês anterior' }).click()
    await expect(page).not.toHaveURL(new RegExp(`mes=${mes}&`))
  })

  test('"Com erro" na tela Fiscal abre o histórico com rejeitadas + erro de integração', async ({ page }) => {
    await page.goto('/fiscal')
    await page.getByRole('link', { name: 'Ver notas com erro ou rejeição' }).click()
    await expect(page).toHaveURL(/status=rejeitada%2Cerro_integracao/)
    await expect(page.locator('[data-filtro-ativo="status"]')).toContainText('Com erro ou rejeição')
    // Seed: nf-1, nf-9 e nf-17 com erro_integracao.
    await expect(page.locator('tr[data-linha-clicavel]:visible')).toHaveCount(3)
  })
})

test('rota inexistente mostra "Página não encontrada" (não o Painel)', async ({ page }) => {
  await entrar(page, 'admin@demo.local')
  await page.goto('/pagina-que-nao-existe')
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
  await page.getByRole('link', { name: 'Ir para Hoje' }).click()
  await expect(page).toHaveURL(/\/hoje$/)
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toHaveCount(0)
})
