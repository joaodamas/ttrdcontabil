'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { Loader2, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { TotpSecret } from 'firebase/auth'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/contexts/auth-context'
import { getClientAuth } from '@/lib/firebase'
import {
  concluirCadastroTotp,
  enviarVerificacaoEmail,
  EVENTO_MFA_ALTERADO,
  fatoresTotp,
  iniciarCadastroTotp,
  lerMfaObrigatorio,
  mensagemErroMfa,
  perfilComSegurancaReforcada,
  reautenticarComSenha,
  removerFator,
  salvarMfaObrigatorio,
  sessaoComSegundoFator,
} from '@/lib/mfa'

type Fator = ReturnType<typeof fatoresTotp>[number]
type Cadastro = { segredo: TotpSecret; qr: string; chave: string }

function SegurancaConta() {
  const { usuario } = useAuth()
  const params = useSearchParams()
  const obrigatorioPeloGuard = params.get('obrigatorio') === '1'
  const reforcada = perfilComSegurancaReforcada(usuario?.perfil)
  const ehAdmin = usuario?.perfil === 'admin'

  const [fatores, setFatores] = useState<Fator[]>([])
  const [emailVerificado, setEmailVerificado] = useState(true)
  const [precisaSenha, setPrecisaSenha] = useState(false)
  const [senha, setSenha] = useState('')
  const [cadastro, setCadastro] = useState<Cadastro | null>(null)
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mfaObrigatorio, setMfaObrigatorio] = useState<boolean | null>(null)
  const [sessaoMfa, setSessaoMfa] = useState(false)

  const atualizar = useCallback(async () => {
    const user = getClientAuth().currentUser
    if (!user) return
    await user.reload().catch(() => undefined)
    setFatores(fatoresTotp(user))
    setEmailVerificado(user.emailVerified)
    setSessaoMfa(await sessaoComSegundoFator())
    setMfaObrigatorio(await lerMfaObrigatorio())
  }, [])

  useEffect(() => {
    void atualizar()
    window.addEventListener(EVENTO_MFA_ALTERADO, atualizar)
    return () => window.removeEventListener(EVENTO_MFA_ALTERADO, atualizar)
  }, [atualizar])

  async function comecar() {
    setErro(null)
    setOcupado(true)
    try {
      if (precisaSenha) {
        await reautenticarComSenha(senha)
        setSenha('')
        setPrecisaSenha(false)
      }
      const r = await iniciarCadastroTotp()
      const qr = await QRCode.toDataURL(r.otpauth, { margin: 1, width: 220 })
      setCadastro({ segredo: r.segredo, qr, chave: r.chave })
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'auth/requires-recent-login') setPrecisaSenha(true)
      if (code === 'auth/unverified-email') setEmailVerificado(false)
      setErro(mensagemErroMfa(err))
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar() {
    if (!cadastro) return
    setErro(null)
    setOcupado(true)
    try {
      await concluirCadastroTotp(cadastro.segredo, codigo)
      setCadastro(null)
      setCodigo('')
      toast.success('Segundo fator ativado. Nos próximos logins, o código do aplicativo será pedido.')
      await atualizar()
    } catch (err) {
      setErro(mensagemErroMfa(err))
    } finally {
      setOcupado(false)
    }
  }

  async function remover(fator: Fator) {
    if (mfaObrigatorio && reforcada && fatores.length <= 1) {
      toast.error('O 2º fator é obrigatório para o seu perfil. Cadastre outro antes de remover este.')
      return
    }
    setErro(null)
    setOcupado(true)
    try {
      await removerFator(fator.uid)
      toast.success('Segundo fator removido.')
      await atualizar()
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/requires-recent-login') setPrecisaSenha(true)
      setErro(mensagemErroMfa(err))
    } finally {
      setOcupado(false)
    }
  }

  async function verificarEmail() {
    try {
      await enviarVerificacaoEmail()
      toast.success('Enviamos o link de verificação para o seu e-mail. Depois de confirmar, volte aqui.')
    } catch (err) {
      toast.error(mensagemErroMfa(err))
    }
  }

  async function alternarObrigatorio(valor: boolean) {
    if (!usuario?.tenantId) return
    if (valor && !sessaoMfa) {
      toast.error('Para ligar a exigência, entre de novo usando o seu 2º fator (saia e faça login com o código).')
      return
    }
    setOcupado(true)
    try {
      await salvarMfaObrigatorio(valor, usuario.tenantId)
      setMfaObrigatorio(valor)
      toast.success(valor ? 'Exigência ligada para administradores e fiscais.' : 'Exigência desligada.')
    } catch (err) {
      console.error('[seguranca] interruptor', err)
      toast.error('Não foi possível salvar. Só um administrador que entrou com o 2º fator pode alterar.')
    } finally {
      setOcupado(false)
    }
  }

  const temFator = fatores.length > 0

  return (
    <div className="stack-6 max-w-3xl">
      <PageHeader title="Segurança da conta" description="Segundo fator de autenticação (aplicativo autenticador)." />

      {obrigatorioPeloGuard && !temFator && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>O escritório exige 2º fator para administradores e fiscais. Cadastre o aplicativo autenticador para continuar usando o sistema.</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            {temFator ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}
            <CardTitle className="text-base">{temFator ? '2º fator ativo' : '2º fator não configurado'}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Com o 2º fator, além da senha o login pede um código de 6 dígitos gerado no celular
            (Google Authenticator, Microsoft Authenticator, Authy…). Senha vazada sozinha não entra.
          </p>

          {temFator && (
            <ul className="divide-y rounded-lg border">
              {fatores.map((f) => (
                <li key={f.uid} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="font-medium">{f.displayName || 'Aplicativo autenticador'}</p>
                    <p className="text-xs text-muted-foreground">Cadastrado em {new Date(f.enrollmentTime).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={ocupado} onClick={() => void remover(f)}>
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {!emailVerificado && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              O Firebase só aceita 2º fator em conta com e-mail confirmado.{' '}
              <button type="button" className="font-semibold underline" onClick={() => void verificarEmail()}>
                Enviar link de verificação
              </button>
            </div>
          )}

          {precisaSenha && (
            <div className="space-y-1.5">
              <Label htmlFor="senha-reauth">Confirme sua senha</Label>
              <Input id="senha-reauth" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
          )}

          {!cadastro && !temFator && (
            <Button disabled={ocupado || (precisaSenha && !senha)} onClick={() => void comecar()}>
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
              Configurar aplicativo autenticador
            </Button>
          )}

          {cadastro && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="font-medium">1. Escaneie o QR Code no aplicativo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cadastro.qr} alt="QR Code para o aplicativo autenticador" width={220} height={220} className="rounded bg-white p-2" />
              <p className="text-xs text-muted-foreground">
                Sem câmera? Digite a chave no aplicativo: <code className="select-all break-all rounded bg-muted px-1 py-0.5">{cadastro.chave}</code>
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="codigo-cadastro">2. Digite o código de 6 dígitos que apareceu</Label>
                <Input
                  id="codigo-cadastro"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  className="max-w-40 text-center font-mono tracking-[0.3em]"
                />
              </div>
              <div className="flex gap-2">
                <Button disabled={ocupado || codigo.replace(/\D/g, '').length !== 6} onClick={() => void confirmar()}>
                  {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
                  Ativar
                </Button>
                <Button variant="outline" disabled={ocupado} onClick={() => { setCadastro(null); setCodigo('') }}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </CardContent>
      </Card>

      {ehAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Exigir 2º fator de administradores e fiscais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <p className="text-muted-foreground">
                Ligado: quem é administrador ou fiscal e não tem 2º fator é levado ao cadastro, e as operações sensíveis
                (usuários, senhas de portal, certificado A1) só funcionam em sessão que entrou com o código.
                Antes de ligar, confirme que o Identity Platform e o TOTP estão habilitados no console e que você entrou com o 2º fator.
              </p>
              <Switch
                checked={mfaObrigatorio === true}
                disabled={mfaObrigatorio === null || ocupado}
                aria-label="Exigir 2º fator de administradores e fiscais"
                onCheckedChange={(v) => void alternarObrigatorio(v)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Sessão atual {sessaoMfa ? 'entrou com 2º fator.' : 'entrou só com senha.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function SegurancaContaPage() {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-xl bg-muted/80" />}>
      <SegurancaConta />
    </Suspense>
  )
}
