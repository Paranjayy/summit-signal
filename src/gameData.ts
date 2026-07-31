export type RunMode = 'standard' | 'stormline' | 'zenith'
export type BiomeId = 'rust-yard' | 'neon-underpass' | 'cloud-cathedral' | 'signal-core'

export type RunModifiers = {
  speedMultiplier: number
  windMultiplier: number
  gravityMultiplier: number
  burstCooldownMultiplier: number
  burstLiftMultiplier: number
  pickupRadius: number
  airControlBonus: number
  anchorCharges: number
}

export const DEFAULT_MODIFIERS: RunModifiers = {
  speedMultiplier: 1,
  windMultiplier: 1,
  gravityMultiplier: 1,
  burstCooldownMultiplier: 1,
  burstLiftMultiplier: 1,
  pickupRadius: .85,
  airControlBonus: 0,
  anchorCharges: 0,
}

export type SignalCard = {
  id: string
  title: string
  upside: string
  cost: string
  accent: string
  apply: Partial<RunModifiers>
}

export const CARD_POOL: SignalCard[] = [
  { id: 'ghost-step', title: 'GHOST STEP', upside: 'More air control', cost: 'Slower steering', accent: '#8b6ee8', apply: { airControlBonus: .38, speedMultiplier: .92 } },
  { id: 'redline', title: 'REDLINE', upside: 'Move 22% faster', cost: 'Wind hits 35% harder', accent: '#d64735', apply: { speedMultiplier: 1.22, windMultiplier: 1.35 } },
  { id: 'magnet', title: 'MAGNET', upside: 'Pull shards from distance', cost: 'No movement bonus', accent: '#e4b849', apply: { pickupRadius: 1.8 } },
  { id: 'anchor', title: 'ANCHOR', upside: 'Forgive one fall', cost: 'One use only', accent: '#4e9e9a', apply: { anchorCharges: 1 } },
  { id: 'overcharge', title: 'OVERCHARGE', upside: 'Burst recharges faster', cost: 'Burst lifts less', accent: '#ed7a3c', apply: { burstCooldownMultiplier: .58, burstLiftMultiplier: .72 } },
]

export const getModeLabel = (mode: RunMode) => mode === 'stormline' ? 'STORMLINE' : mode === 'zenith' ? 'ZENITH' : 'STANDARD'

export const getBiome = (height: number, courseHeight: number): BiomeId => {
  const progress = courseHeight > 0 ? height / courseHeight : 0
  if (progress >= .9) return 'signal-core'
  if (progress >= .58) return 'cloud-cathedral'
  if (progress >= .27) return 'neon-underpass'
  return 'rust-yard'
}

export const biomeLabels: Record<BiomeId, string> = {
  'rust-yard': 'RUST YARD',
  'neon-underpass': 'NEON UNDERPASS',
  'cloud-cathedral': 'CLOUD CATHEDRAL',
  'signal-core': 'SIGNAL CORE',
}

export const mergeModifiers = (current: RunModifiers, card: SignalCard): RunModifiers => ({
  ...current,
  ...Object.fromEntries(Object.entries(card.apply).map(([key, value]) => {
    const existing = current[key as keyof RunModifiers]
    return [key, typeof value === 'number' && typeof existing === 'number' && key !== 'anchorCharges' && key !== 'airControlBonus' && key !== 'pickupRadius' ? existing * value : typeof value === 'number' && typeof existing === 'number' && key === 'airControlBonus' ? existing + value : value]
  })),
})
