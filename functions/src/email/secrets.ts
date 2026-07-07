import { defineSecret } from 'firebase-functions/params'

// SMTP_HOST/PORT/EMAIL_FROM/EMAIL_TO ficam em functions/.env (não são
// sensíveis — servidor, porta e endereços de exibição). Só usuário e senha
// da conta de envio precisam ser secret de verdade.
export const SMTP_USER_SECRET = defineSecret('SMTP_USER')
export const SMTP_PASS_SECRET = defineSecret('SMTP_PASS')
export const emailSecrets = [SMTP_USER_SECRET, SMTP_PASS_SECRET]
