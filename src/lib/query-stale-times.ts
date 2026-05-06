export const queryStaleTimes = {
  realtime: 30_000,
  operational: 60_000,
  fiscal: 90_000,
  financial: 90_000,
  reference: 5 * 60_000,
} as const
