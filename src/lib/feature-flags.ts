import type { UiFeatureFlags } from '@/features/admin/types'

export type UiFeatureFlagKey = keyof UiFeatureFlags

export const DEFAULT_UI_FEATURE_FLAGS: UiFeatureFlags = {
  premiumUiEnabled: false,
  dashboardV2Enabled: false,
  tableV2Enabled: false,
  modalV2Enabled: false,
  sidebarV2Enabled: false,
}

export const UI_FEATURE_FLAG_META: Record<UiFeatureFlagKey, { label: string; description: string }> = {
  premiumUiEnabled: {
    label: 'UI premium global',
    description: 'Habilita a camada base do redesign para tenants liberados no rollout.',
  },
  dashboardV2Enabled: {
    label: 'Dashboard inteligente',
    description: 'Permite trocar o painel atual pelo dashboard V2 quando ele estiver disponível.',
  },
  tableV2Enabled: {
    label: 'Tabelas V2',
    description: 'Permite liberar tabelas com densidade, colunas e visual premium por módulo.',
  },
  modalV2Enabled: {
    label: 'Modais V2',
    description: 'Permite usar o novo padrão de modais, wizards e rodapé fixo.',
  },
  sidebarV2Enabled: {
    label: 'Sidebar V2',
    description: 'Permite liberar navegação moderna com favoritos, recentes e ações rápidas.',
  },
}

export const UI_FEATURE_FLAG_KEYS = Object.keys(UI_FEATURE_FLAG_META) as UiFeatureFlagKey[]

export function normalizeUiFeatureFlags(flags?: Partial<UiFeatureFlags> | null): UiFeatureFlags {
  return UI_FEATURE_FLAG_KEYS.reduce<UiFeatureFlags>(
    (acc, key) => {
      acc[key] = Boolean(flags?.[key])
      return acc
    },
    { ...DEFAULT_UI_FEATURE_FLAGS }
  )
}

export function isUiFeatureEnabled(flags: UiFeatureFlags | undefined, key: UiFeatureFlagKey) {
  return Boolean(flags?.[key])
}
