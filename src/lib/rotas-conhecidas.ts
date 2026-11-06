/**
 * Rotas que existem no app (uma por page.tsx em src/app; `:id` = segmento
 * dinâmico). No Firebase Hosting o rewrite `**` → /dashboard.html faz qualquer
 * endereço desconhecido abrir o Painel; o layout usa esta lista para mostrar
 * "Página não encontrada" em vez disso. O teste
 * __tests__/lib/rotas-conhecidas.test.ts compara a lista com o sistema de
 * arquivos — rota nova sem entrada aqui quebra o teste.
 */
export const ROTAS_CONHECIDAS = [
  '/',
  '/login',
  '/hoje',
  '/dashboard',
  '/admin',
  '/admin/conectores',
  '/admin/parametros',
  '/admin/servicos',
  '/admin/usuarios',
  '/clientes',
  '/clientes/novo',
  '/clientes/importar',
  '/clientes/:id',
  '/clientes/:id/editar',
  '/clientes/:id/fiscal',
  '/clientes/:id/servicos/novo',
  '/clientes/:id/tomadores',
  '/clientes/:id/tomadores/importar',
  '/conta/seguranca',
  '/competencias',
  '/competencias/nova',
  '/competencias/:id',
  '/competencias/:id/editar',
  '/fechamento',
  '/financeiro',
  '/financeiro/novo',
  '/fiscal',
  '/fiscal/emitir',
  '/fiscal/historico',
  '/fiscal/:id',
  '/ir',
  '/ir/nova',
  '/ir/:id',
  '/ir/:id/editar',
  '/relatorios/carteira',
  '/relatorios/produtividade',
  '/servicos',
  '/tarefas',
  '/tarefas/nova',
  '/tarefas/:id',
  '/tarefas/:id/editar',
] as const

function normalizar(pathname: string): string[] {
  const semQuery = pathname.split(/[?#]/)[0]
  // cleanUrls do Firebase: /hoje.html redireciona para /hoje, mas aceita os dois.
  const semHtml = semQuery.replace(/\.html$/, '').replace(/\/index$/, '/')
  return semHtml.split('/').filter(Boolean)
}

const PADROES = ROTAS_CONHECIDAS.map((r) => r.split('/').filter(Boolean))

/** O endereço corresponde a alguma tela do app? */
export function rotaConhecida(pathname: string): boolean {
  const partes = normalizar(pathname)
  return PADROES.some((padrao) =>
    padrao.length === partes.length &&
    padrao.every((seg, i) => seg === ':id' ? partes[i].length > 0 : seg === partes[i]),
  )
}
