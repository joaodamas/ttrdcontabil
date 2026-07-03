'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { sendPasswordResetEmail } from 'firebase/auth'
import { toast } from 'sonner'
import { signIn } from '@/lib/auth-client'
import { getClientAuth } from '@/lib/firebase'
import { appConfig } from '@/lib/app-config'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Users,
  FileCheck2,
} from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(1, 'Informe a senha'),
})

type LoginFormValues = z.input<typeof loginSchema>

const BRAND_BLUE  = '#2243A5'
const BRAND_GREEN = '#13A877'

const STATS = [
  { label: 'Clientes ativos',       value: '200+',  icon: Users,       color: BRAND_BLUE },
  { label: 'Fechamentos/mês',        value: '99%',   icon: CheckCircle2, color: BRAND_GREEN },
  { label: 'Obrigações entregues',   value: '100%',  icon: FileCheck2,  color: '#4f7df0' },
]

const FEATURES = [
  'Gestão completa de clientes e competências',
  'Fechamento mensal e controle de obrigações',
  'Fiscal, NFS-e e lançamentos financeiros',
]

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawFrom = searchParams.get('from')
  const isInternalPath = (p: string | null): p is string =>
    !!p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\') && !p.includes('\\')
  const from = isInternalPath(rawFrom) ? rawFrom : '/hoje'
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(data: LoginFormValues) {
    setError(null)
    try {
      await signIn(data.email, data.senha)
      router.push(from)
    } catch (err) {
      const code = (err as { code?: string }).code
      const msg = (err as { message?: string }).message ?? ''
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        setError('E-mail ou senha inválidos')
      } else if (code === 'auth/too-many-requests') {
        setError('Muitas tentativas. Aguarde alguns minutos.')
      } else if (code === 'auth/user-disabled') {
        setError('Usuário inativo. Contate o administrador.')
      } else if (msg) {
        setError(msg)
      } else {
        setError('Erro de conexão. Tente novamente.')
      }
    }
  }

  async function handleForgotPassword() {
    if (resetLoading) return
    const email = getValues('email')?.trim() ?? ''
    const parsed = z.string().email().safeParse(email)
    if (!parsed.success) {
      await trigger('email')
      setFocus('email')
      toast.error('Informe um e-mail válido para receber o link de redefinição.')
      return
    }

    setResetLoading(true)
    try {
      await sendPasswordResetEmail(getClientAuth(), parsed.data)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'auth/network-request-failed' || code === 'auth/too-many-requests') {
        toast.error('Não foi possível enviar agora. Tente novamente.')
        setResetLoading(false)
        return
      }
      // Demais erros (ex.: auth/user-not-found) caem na mensagem neutra abaixo —
      // não revelamos se o e-mail existe (anti-enumeração)
    }
    toast.success('Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha.')
    setResetLoading(false)
  }

  return (
    <div className="min-h-screen flex">

      {/* ── PAINEL ESQUERDO — dark navy + glows JP ──────────── */}
      <div
        className="hidden lg:flex lg:w-[52%] flex-col relative overflow-hidden"
        style={{ background: '#070d22' }}
      >
        {/* Grid de pontos azuis */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(34,67,165,0.18) 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }}
        />
        {/* Glow azul superior direito */}
        <div
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(34,67,165,0.22) 0%, transparent 70%)' }}
        />
        {/* Glow verde inferior esquerdo */}
        <div
          className="absolute -bottom-40 -left-20 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(19,168,119,0.12) 0%, transparent 70%)' }}
        />
        {/* Linha diagonal decorativa */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, transparent 0%, transparent 49.5%, rgba(34,67,165,0.07) 49.5%, rgba(34,67,165,0.07) 50.5%, transparent 50.5%)',
          }}
        />

        {/* Conteúdo */}
        <div className="relative z-10 flex flex-col h-full px-12 py-10">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0 bg-white"
            >
              {appConfig.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={appConfig.logoUrl} alt="" className="h-7 w-7 object-contain" />
              ) : (
                <span style={{ fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.1em', lineHeight: 1, fontSize: 16 }}>
                  <span style={{ color: BRAND_BLUE }}>J</span><span style={{ color: BRAND_GREEN }}>P</span>
                </span>
              )}
            </div>
            <div>
              <p className="font-bold text-white text-base leading-tight tracking-wide">{appConfig.name}</p>
              <p className="text-white/40 text-xs tracking-wider uppercase">{appConfig.tagline}</p>
            </div>
          </div>

          {/* Headline */}
          <div className="flex-1 flex flex-col justify-center space-y-8">
            <div className="space-y-4">
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
                style={{ borderColor: 'rgba(34,67,165,0.4)', color: '#4f7df0', background: 'rgba(34,67,165,0.10)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: BRAND_GREEN }} />
                Sistema em operação
              </div>

              <h1 className="text-4xl font-bold leading-[1.15] text-white">
                Sua contabilidade<br />
                <span style={{
                  background: `linear-gradient(90deg, #4f7df0, ${BRAND_GREEN})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>
                  no próximo nível
                </span>
              </h1>

              <p className="text-white/50 text-sm leading-relaxed max-w-xs">
                Plataforma completa para escritórios contábeis — clientes, obrigações, fiscal e financeiro em um único painel.
              </p>
            </div>

            {/* Features */}
            <div className="space-y-3">
              {FEATURES.map((feat, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className="flex items-center justify-center w-5 h-5 rounded-full shrink-0 mt-0.5"
                    style={{ background: 'rgba(19,168,119,0.15)' }}
                  >
                    <CheckCircle2 className="w-3 h-3" style={{ color: BRAND_GREEN }} />
                  </div>
                  <span className="text-sm text-white/60 leading-relaxed">{feat}</span>
                </div>
              ))}
            </div>

            {/* Comparativo */}
            <div
              className="rounded-xl p-4 space-y-3 max-w-md"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                Conta Azul / Omie vs. fluxo do escritório
              </p>
              <p className="text-sm text-white/55 leading-relaxed">
                ERPs populares organizam o financeiro <em className="text-white/70 not-italic">da empresa do cliente</em>.
                {appConfig.shortName} organiza o <strong className="text-white/85">trabalho do contador</strong>: competências, fechamento,
                obrigações e fiscal — com cliente 360 e cockpit diário.
              </p>
              <ul className="text-xs text-white/45 space-y-1.5 leading-relaxed">
                <li>Fechamento guiado e fila crítica (DAS, eSocial, Reinf, FGTS)</li>
                <li>Cockpit &quot;Hoje&quot; com SLA, lote e bloqueios de mês</li>
                <li>Timeline unificada por cliente (operacional + fiscal + financeiro)</li>
              </ul>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {STATS.map(({ label, value, icon: Icon, color }) => (
                <div
                  key={label}
                  className="rounded-xl p-3.5 space-y-2"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                  <p className="text-xl font-bold text-white">{value}</p>
                  <p className="text-xs text-white/40 leading-tight">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-white/20">
            © {new Date().getFullYear()} {appConfig.name} · Acesso restrito
          </p>
        </div>
      </div>

      {/* ── PAINEL DIREITO ──────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative"
        style={{ background: '#f6f7f9' }}
      >
        {/* Padrão de fundo sutil */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(34,67,165,0.05) 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
          }}
        />

        {/* Logo mobile */}
        <div className="flex flex-col items-center mb-8 lg:hidden relative z-10">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl mb-3 bg-white shadow-sm">
            {appConfig.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={appConfig.logoUrl} alt="" className="h-8 w-8 object-contain" />
            ) : (
              <span style={{ fontWeight: 800, fontStyle: 'italic', letterSpacing: '-0.1em', lineHeight: 1, fontSize: 20 }}>
                <span style={{ color: BRAND_BLUE }}>J</span><span style={{ color: BRAND_GREEN }}>P</span>
              </span>
            )}
          </div>
          <p className="font-bold text-[#0a0a0a] text-base">{appConfig.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{appConfig.tagline}</p>
        </div>

        {/* Card do formulário */}
        <div
          className="w-full max-w-[380px] relative z-10"
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            padding: '36px',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.07), 0 8px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          {/* Header do card */}
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: BRAND_BLUE }}
              >
                <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-[#0a0a0a] leading-tight">
              Bem-vindo de volta
            </h2>
            <p className="text-sm text-gray-500 mt-1.5">
              Entre com suas credenciais para acessar o painel
            </p>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
                autoFocus
                className="h-11 bg-gray-50 border-gray-200 focus:border-[#2243A5] focus:ring-[#2243A5]/20 text-[#0a0a0a] placeholder:text-gray-400 rounded-xl transition-all"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <Label htmlFor="senha" className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="senha"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-11 bg-gray-50 border-gray-200 focus:border-[#2243A5] focus:ring-[#2243A5]/20 text-[#0a0a0a] placeholder:text-gray-400 rounded-xl pr-10 transition-all"
                  {...register('senha')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.senha && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {errors.senha.message}
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  className="text-xs font-medium text-gray-500 hover:text-[#2243A5] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {resetLoading ? 'Enviando...' : 'Esqueci minha senha'}
                </button>
              </div>
            </div>

            {/* Erro geral */}
            {error && (
              <div
                className="flex items-start gap-2.5 text-sm rounded-xl px-3.5 py-3"
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#dc2626',
                }}
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer mt-2 text-white"
              style={{
                background: isSubmitting ? '#1b3585' : BRAND_BLUE,
                boxShadow: isSubmitting ? 'none' : '0 4px 16px rgba(34,67,165,0.35)',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  Entrar no painel
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 relative z-10">
          Acesso restrito a usuários autorizados
        </p>
      </div>
    </div>
  )
}
