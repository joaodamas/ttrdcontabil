import { defineSecret } from 'firebase-functions/params'

export const CREDENTIAL_KEY_SECRET = defineSecret('CREDENTIAL_KEY')
export const credentialSecrets = [CREDENTIAL_KEY_SECRET]
