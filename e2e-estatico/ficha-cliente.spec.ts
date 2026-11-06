import path from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'

/*
 * Ficha única do cliente (painel lateral de tamanho fixo + página), contra o
 * build estático + emuladores (seed: scripts/seed-emulador.mjs — cli-02 tem
 * notas emitidas com XML e certificado A1 válido). Ver `npm run test:e2e:estatico`.
 * Screenshots: E2E_SCREENSHOTS_DIR (padrão test-results/ficha).
 */

const DIR_SCREENSHOTS = process.env.E2E_SCREENSHOTS_DIR ?? 'test-results/ficha'

async function entrar(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#senha').fill('demo1234')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
}

/** Caixa do elemento depois que a animação de entrada terminou. */
async function caixaEstavel(el: Locator) {
  let anterior = ''
  let caixa: { x: number; y: number; width: number; height: number } | null = null
  await expect.poll(async () => {
    caixa = await el.boundingBox()
    const atual = JSON.stringify(caixa)
    const estavel = atual === anterior
    anterior = atual
    return estavel
  }, { intervals: [150, 150, 250, 250, 500] }).toBe(true)
  return caixa!
}

const painel = (page: Page) => page.getByTestId('painel-cliente')

async function abrirPrimeiroClienteDaLista(page: Page) {
  await page.goto('/clientes')
  const linha = page.locator('tr[data-linha-clicavel]:visible').first()
  await expect(linha).toBeVisible()
  // Célula do CNPJ (sem link/botão).
  await linha.locator('td').nth(1).click()
  await expect(page).toHaveURL(/[?&]cliente=cli-\d+/)
  await expect(painel(page)).toBeVisible()
}

async function nomesDasAbas(escopo: Locator) {
  return (await escopo.getByRole('tab').allInnerTexts()).map((t) => t.replace(/\d+/g, '').trim())
}

test.describe('ficha do cliente — painel (admin)', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'admin@demo.local')
  })

  test('abrir cliente pela lista abre o painel; Voltar fecha', async ({ page }) => {
    await abrirPrimeiroClienteDaLista(page)
    await expect(painel(page).getByRole('tab', { name: /Cadastro/ })).toBeVisible()
    await expect(painel(page).getByText(/campos preenchidos/)).toBeVisible()

    await page.goBack()
    await expect(painel(page)).toBeHidden()
    await expect(page).toHaveURL(/\/clientes(\?(?!.*cliente=).*)?$/)

    // Fechar pelo X também volta para a lista.
    await abrirPrimeiroClienteDaLista(page)
    await painel(page).getByRole('button', { name: 'Fechar' }).click()
    await expect(painel(page)).toBeHidden()
    await expect(page).not.toHaveURL(/cliente=/)
  })

  test('trocar de aba não muda o tamanho do painel', async ({ page }) => {
    await page.goto('/clientes?cliente=cli-02')
    const p = painel(page)
    await expect(p.getByText(/campos preenchidos/)).toBeVisible()
    const base = await caixaEstavel(p)
    const viewport = page.viewportSize()!
    expect(base.height).toBe(viewport.height)
    expect(Math.round(base.x + base.width)).toBe(viewport.width)

    const abas = await nomesDasAbas(p)
    expect(abas).toEqual(['Cadastro', 'Atividade', 'Competências', 'Serviços', 'Financeiro', 'Fiscal', 'POP'])
    for (const aba of abas) {
      await p.getByRole('tab', { name: new RegExp(`^${aba}`) }).click()
      await expect(p.getByRole('tab', { name: new RegExp(`^${aba}`) })).toHaveAttribute('aria-selected', 'true')
      await page.waitForTimeout(150)
      const caixa = await p.boundingBox()
      expect(caixa, `aba ${aba}`).toEqual(base)
      await page.screenshot({ path: path.join(DIR_SCREENSHOTS, `desktop-${aba.normalize('NFD').replace(/[^\w]/g, '').toLowerCase()}.png`) })
    }
  })

  test('aba Fiscal: PDF e XML por nota, linha abre a nota, certificado como status', async ({ page }) => {
    await page.goto('/clientes?cliente=cli-02')
    const p = painel(page)
    await p.getByRole('tab', { name: /^Fiscal/ }).click()

    const historico = p.getByTestId('historico-nfse-cliente')
    const linhas = historico.locator('tr[data-testid="linha-nfse"]')
    await expect(linhas.first()).toBeVisible()
    const n = await linhas.count()
    expect(n).toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      const linha = linhas.nth(i)
      await expect(linha.getByRole('button', { name: 'Baixar PDF (DANFSe)' }).filter({ visible: true })).toHaveCount(1)
      await expect(linha.getByRole('button', { name: 'Baixar XML' }).filter({ visible: true })).toHaveCount(1)
    }
    await expect(historico.getByRole('link', { name: /Ver todas/ })).toHaveAttribute('href', '/fiscal/historico?clienteId=cli-02')

    // XML baixa direto do campo xmlNfse.
    const download = page.waitForEvent('download')
    await linhas.first().getByRole('button', { name: 'Baixar XML' }).filter({ visible: true }).click()
    expect((await download).suggestedFilename()).toMatch(/^NFSe-\d+-.*\.xml$/)

    // Certificado: cartão de status, sem formulário de upload até pedir.
    const cert = p.getByTestId('certificado-status')
    await expect(cert.getByText('Válido', { exact: true }).first()).toBeVisible()
    await expect(cert.getByText(/OFICINA MECÂNICA TORQUE ME/)).toBeVisible()
    await expect(cert.locator('input[type="file"]')).toHaveCount(0)
    await cert.getByRole('button', { name: 'Substituir certificado' }).click()
    await expect(cert.locator('input[type="file"]')).toHaveCount(1)

    // Linha inteira abre o detalhe da nota.
    const destino = await linhas.first().getAttribute('data-href')
    expect(destino).toMatch(/^\/fiscal\/nf-\d+$/)
    await linhas.first().locator('td:visible').nth(1).click()
    await page.waitForURL((url) => url.pathname === destino)
    await expect(page.getByRole('heading', { name: /NFS-e \d+/ })).toBeVisible()
  })

  test('certificado vencendo e vencido aparecem com alerta', async ({ page }) => {
    await page.goto('/clientes?cliente=cli-03')
    await painel(page).getByRole('tab', { name: /^Fiscal/ }).click()
    await expect(painel(page).getByTestId('certificado-status').getByRole('alert')).toContainText(/vence em 20 dias/)

    await page.goto('/clientes?cliente=cli-04')
    await painel(page).getByRole('tab', { name: /^Fiscal/ }).click()
    await expect(painel(page).getByTestId('certificado-status').getByRole('alert')).toContainText(/vencido/i)
  })

  test('Expandir abre a página com as mesmas abas', async ({ page }) => {
    await page.goto('/clientes?cliente=cli-02')
    const p = painel(page)
    await expect(p.getByText(/campos preenchidos/)).toBeVisible()
    const abasPainel = await nomesDasAbas(p)
    await p.getByRole('tab', { name: /^Fiscal/ }).click()
    await p.getByRole('button', { name: 'Expandir' }).click()
    await expect(page).toHaveURL(/\/clientes\/cli-02\?aba=fiscal$/)
    await expect(painel(page)).toHaveCount(0)
    const pagina = page.getByTestId('ficha-cliente')
    await expect(pagina).toHaveAttribute('data-modo', 'pagina')
    expect(await nomesDasAbas(pagina)).toEqual(abasPainel)
    await expect(pagina.getByRole('tab', { name: /^Fiscal/ })).toHaveAttribute('aria-selected', 'true')
    await expect(pagina.getByTestId('historico-nfse-cliente')).toBeVisible()
    await page.screenshot({ path: path.join(DIR_SCREENSHOTS, 'pagina-fiscal.png'), fullPage: true })
  })

  test('nome do pagador no Financeiro abre o painel', async ({ page }) => {
    await page.goto('/financeiro')
    const link = page.locator('a[title="Abrir ficha do cliente"]:visible').first()
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/financeiro\?(.*&)?cliente=cli-\d+/)
    await expect(painel(page)).toBeVisible()
    await page.goBack()
    await expect(painel(page)).toBeHidden()
    await expect(page).toHaveURL(/\/financeiro/)
  })
})

test.describe('ficha do cliente — celular (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('painel em tela cheia, sem rolagem horizontal, em todas as abas', async ({ page }) => {
    await entrar(page, 'admin@demo.local')
    await page.goto('/clientes?cliente=cli-02')
    const p = painel(page)
    await expect(p.getByText(/campos preenchidos/)).toBeVisible()
    const base = await caixaEstavel(p)
    expect(base).toEqual({ x: 0, y: 0, width: 390, height: 844 })

    for (const aba of await nomesDasAbas(p)) {
      const tab = p.getByRole('tab', { name: new RegExp(`^${aba}`) })
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await page.waitForTimeout(150)
      expect(await p.boundingBox(), `aba ${aba}`).toEqual(base)
      // Nada passa da largura do painel (a barra de abas rola por dentro).
      const vazamento = await page.evaluate(() => {
        const conteudo = document.querySelector('[data-testid="ficha-conteudo"]') as HTMLElement
        return {
          pagina: document.documentElement.scrollWidth - window.innerWidth,
          conteudo: conteudo.scrollWidth - conteudo.clientWidth,
        }
      })
      expect(vazamento, `aba ${aba}`).toEqual({ pagina: 0, conteudo: 0 })
      await page.screenshot({ path: path.join(DIR_SCREENSHOTS, `mobile-${aba.normalize('NFD').replace(/[^\w]/g, '').toLowerCase()}.png`) })
    }
  })
})
