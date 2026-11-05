import { defineSecret } from 'firebase-functions/params'

export const TWILIO_ACCOUNT_SID_SECRET = defineSecret('TWILIO_ACCOUNT_SID')
export const TWILIO_AUTH_TOKEN_SECRET = defineSecret('TWILIO_AUTH_TOKEN')
export const twilioSecrets = [TWILIO_ACCOUNT_SID_SECRET, TWILIO_AUTH_TOKEN_SECRET]
