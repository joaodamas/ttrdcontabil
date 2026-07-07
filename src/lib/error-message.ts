const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'permission-denied': 'Você não tem permissão para esta ação.',
  unauthenticated: 'Sessão expirada. Faça login novamente.',
  'not-found': 'Registro não encontrado.',
  'already-exists': 'Este registro já existe.',
  'failed-precondition':
    'Operação indisponível no momento (índice ou pré-condição). Tente novamente.',
  'resource-exhausted': 'Limite de uso atingido. Tente novamente em instantes.',
  unavailable: 'Serviço temporariamente indisponível. Verifique sua conexão.',
  'deadline-exceeded': 'A operação demorou demais. Tente novamente.',
  cancelled: 'Operação cancelada.',
  aborted: 'Conflito ao salvar. Tente novamente.',
  'invalid-argument': 'Dados inválidos.',
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/network-request-failed': 'Falha de conexão. Tente novamente.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
}

function getFirebaseErrorMessage(code: string, fallback: string): string {
  if (code.startsWith('auth/')) {
    return AUTH_ERROR_MESSAGES[code] ?? fallback
  }
  return FIREBASE_ERROR_MESSAGES[code] ?? fallback
}

export function getErrorMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: unknown } | null)?.code
  const message = error instanceof Error && error.message.trim() ? error.message : undefined

  if (typeof code === 'string' && code.trim()) {
    // Erros de Cloud Functions (httpsCallable) chegam com code prefixado
    // ("functions/failed-precondition"), nunca batendo com as chaves sem
    // prefixo de FIREBASE_ERROR_MESSAGES (usadas pelos erros crus do SDK
    // do Firestore). Sem isso, a mensagem específica que a function monta
    // (HttpsError(code, mensagem)) era sempre descartada em favor do
    // fallback genérico — mesmo quando o backend já explicava exatamente
    // o que deu errado.
    if (code.startsWith('functions/')) {
      return message ?? getFirebaseErrorMessage(code.slice('functions/'.length), fallback)
    }
    return getFirebaseErrorMessage(code, fallback)
  }
  if (message) return message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}
