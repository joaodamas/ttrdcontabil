import { test as base, expect } from '@playwright/test'

/*
 * O emulador de hosting aplica os headers do firebase.json, inclusive a CSP de
 * produção (PR #25). O connect-src dela não inclui os emuladores locais
 * (auth 9099, firestore 8080, storage 9199) — sem ajuste o login nem acontece.
 * Aqui só o connect-src da página ganha as origens dos emuladores; o resto da
 * política continua valendo e qualquer violação de CSP no console reprova o
 * teste.
 */
const EMULADORES = 'http://127.0.0.1:9099 http://127.0.0.1:8080 http://127.0.0.1:9199 ws://127.0.0.1:8080'
const RE_VIOLACAO = /Content Security Policy|Refused to (load|connect|execute|apply|frame|create)/i

export function cspComEmuladores(csp: string): string {
  return csp
    .replace(/connect-src ([^;]*)/, (_, origens: string) => `connect-src ${origens} ${EMULADORES}`)
    // Os emuladores são http: com upgrade-insecure-requests o navegador troca
    // as chamadas para https e elas falham (auth/network-request-failed).
    // Em produção tudo é https, então a diretiva não muda nada lá.
    .replace(/;?\s*upgrade-insecure-requests/, '')
}

export const test = base.extend<{ violacoesCsp: string[] }>({
  violacoesCsp: [
    async ({ page, baseURL }, use) => {
      const violacoes: string[] = []
      page.on('console', (msg) => {
        if (RE_VIOLACAO.test(msg.text())) violacoes.push(msg.text())
      })
      await page.route(
        (url) => !!baseURL && url.origin === new URL(baseURL).origin,
        async (route) => {
          if (route.request().resourceType() !== 'document') return route.continue()
          const resposta = await route.fetch()
          const headers = resposta.headers()
          const csp = headers['content-security-policy']
          if (csp) headers['content-security-policy'] = cspComEmuladores(csp)
          await route.fulfill({ response: resposta, headers })
        },
      )
      await use(violacoes)
      expect(violacoes, 'violações de CSP no console').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
