import { createContext, useContext, useMemo, type ReactNode } from 'react'

export interface CardItemContextValue {
  /** The entity the grid placed — target of `call-service` and the generic toggle. */
  entityId?: string
  /** The placed item's stored options, where the three action keys live. */
  config?: Record<string, unknown>
}

const CardItemContext = createContext<CardItemContextValue>({})

/**
 * What the grid knows about the item it is rendering, handed to the card shell
 * without going through the cards.
 *
 * The shell's gesture controller needs two things from the placed item — the
 * entity id and the stored options — and neither is anything a card decides.
 * Threading them as props would mean adding two pass-through props (and two
 * `memo` comparator entries) to every card for values the cards never read,
 * so the grid publishes them instead and `GridCard` picks them up. What a card
 * *does* decide — what its `default` action resolves to — stays an explicit
 * prop on the shell, because that one is genuinely per-card.
 *
 * Outside the grid (config previews, stories, unit tests) there is no provider,
 * the context is empty, and the shell falls back to its props.
 */
export function CardItemProvider({
  entityId,
  config,
  children,
}: CardItemContextValue & { children: ReactNode }) {
  const value = useMemo(() => ({ entityId, config }), [entityId, config])

  return <CardItemContext.Provider value={value}>{children}</CardItemContext.Provider>
}

export function useCardItem(): CardItemContextValue {
  return useContext(CardItemContext)
}
