/**
 * Utilitário de envio de email via Nodemailer.
 *
 * Configuração (Firebase Functions config ou env vars):
 *   SMTP_HOST   — ex: smtp.gmail.com
 *   SMTP_PORT   — ex: 587
 *   SMTP_USER   — email remetente
 *   SMTP_PASS   — senha ou App Password
 *   EMAIL_FROM  — ex: "TTRD Contábil <noreply@ttrd.com.br>"
 *   EMAIL_TO    — destinatário padrão (email do escritório)
 *
 * Para configurar no Firebase:
 *   firebase functions:secrets:set SMTP_HOST
 *   firebase functions:secrets:set SMTP_PASS
 *   (etc.)
 */
import * as nodemailer from 'nodemailer'

export interface EmailOptions {
  to?:      string   // se omitido, usa EMAIL_TO
  subject:  string
  html:     string
  text?:    string
}

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
  })
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const transport = createTransport()
  await transport.sendMail({
    from:    process.env.EMAIL_FROM  ?? process.env.SMTP_USER,
    to:      opts.to ?? process.env.EMAIL_TO ?? process.env.SMTP_USER,
    subject: opts.subject,
    html:    opts.html,
    text:    opts.text,
  })
}

// ─── Templates ────────────────────────────────────────────────────────────────

/**
 * Escapa texto para HTML. Tudo que vem do banco (nome de cliente, descrição,
 * mensagem de erro da Sefin/prefeitura) entra no e-mail por aqui — antes um
 * `<` num nome de tomador quebrava o e-mail ou injetava marcação (B12).
 */
export function escapeHtml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function tableHtml(
  title: string,
  headers: string[],
  rows: unknown[][]
): string {
  const headerRow = headers.map((h) => `<th style="text-align:left;padding:6px 12px;background:#f5f5f5;border-bottom:2px solid #ddd">${escapeHtml(h)}</th>`).join('')
  const bodyRows  = rows.map((r) =>
    `<tr>${r.map((c) => `<td style="padding:6px 12px;border-bottom:1px solid #eee">${escapeHtml(c)}</td>`).join('')}</tr>`
  ).join('')

  return `
<div style="font-family:sans-serif;max-width:800px;margin:0 auto">
  <h2 style="color:#222">${escapeHtml(title)}</h2>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <p style="font-size:12px;color:#888;margin-top:24px">
    TTRD Contábil — alerta automático. Não responda este email.
  </p>
</div>`
}
