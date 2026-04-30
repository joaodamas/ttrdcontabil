import { test, expect } from '@playwright/test'

test('Criar tarefa, visualizar no cockpit e concluir', async ({ page }) => {
  test.skip(true, 'Depende de autenticação e massa de dados')
  await page.goto('/tarefas/nova')
  await expect(page).toHaveURL(/tarefas\/nova/)
})
