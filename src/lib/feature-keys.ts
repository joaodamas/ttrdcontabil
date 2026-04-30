export function createFeatureKeys<const TPrefix extends string>(prefix: TPrefix) {
  return {
    all: [prefix] as const,
    list: (scope: string) => [prefix, scope] as const,
    detail: (scope: string, id: string) => [prefix, scope, id] as const,
  }
}
