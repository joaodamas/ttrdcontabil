import { defineSecret } from 'firebase-functions/params'

export const CREDENTIAL_KEY_SECRET = defineSecret('CREDENTIAL_KEY')
export const credentialSecrets = [CREDENTIAL_KEY_SECRET]

// A chave "Owner" da Spedy (SPEDY_OWNER_API_KEY) é declarada DENTRO de
// provisionar-spedy.ts — assim o defineSecret só é registrado quando aquela
// function é reativada (export em index.ts). Enquanto o provisionamento em
// massa está deferido, o deploy não exige esse secret.
