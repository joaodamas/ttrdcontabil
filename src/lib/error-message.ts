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
  if (typeof code === 'string' && code.trim()) {
    return getFirebaseErrorMessage(code, fallback)
  }
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}
