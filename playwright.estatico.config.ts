import { defineConfig, devices } from '@playwright/test'

/**
 * E2E contra o BUILD ESTÁTICO (`out/`) servido pelo emulador de hosting, com os
 * rewrites do firebase.json — exatamente como produção. O `playwright.config.ts`
 * sobe `next dev`, onde as rotas [id] resolvem o parâmetro de verdade e bugs do
 * static export (todas as rotas /x/<id> servem a página "placeholder") passam.
 *
 * Não sobe servidor: rode por `npm run test:e2e:estatico`, que faz o build com
 * os emuladores e chama o Playwright de dentro do `emulators:exec`.
 */
const PORT = Number(process.env.E2E_HOSTING_PORT ?? 5050)

export default defineConfig({
  testDir: './e2e-estatico',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // e2e-estatico/fixtures.ts reescreve a CSP da página (route.fulfill);
        // o Chromium passa a tratar a página como "pública" e o Local Network
        // Access bloqueia as chamadas aos emuladores em 127.0.0.1.
        launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] },
      },
    },
  ],
})
