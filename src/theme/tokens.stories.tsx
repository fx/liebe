import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge, Box, Code, Flex, Heading, Table, Text, Theme } from '@radix-ui/themes'
import {
  domainColorTokens,
  domainColors,
  surfaceReferences,
  tokenGroups,
  type TokenGroup,
} from './tokens'
import { IconCircle } from '~/components/anatomy/IconCircle'

/* ------------------------------------------------------------------ *
 * Reading the live values
 * ------------------------------------------------------------------ */

/**
 * Resolves token values off a real element, so the table shows what the cascade
 * actually produced rather than what the stylesheet says.
 *
 * Deliberately dependency-free. Radix keeps the appearance in state and applies
 * the matching theme class in a passive effect, one render *after* the toolbar
 * global changes — so an effect keyed on the appearance would read the outgoing
 * cascade and never re-read, leaving the tables a switch behind. Running after
 * every render catches that second render; bailing out when nothing changed is
 * what stops it looping.
 */
function useResolvedTokens(names: string[]) {
  const ref = useRef<HTMLDivElement>(null)
  const [values, setValues] = useState<Record<string, string>>({})

  // No dependency list, and `exhaustive-deps` is turned off for this file in
  // `eslint.config.js` rather than by a comment here — an inline directive
  // makes the React compiler bail on this whole function, taking
  // `set-state-in-effect` with it. The rule's suggested `[names]` is exactly
  // what must not happen: it would re-key the effect on a value that never
  // changes when the appearance does, which is the staleness this hook exists
  // to avoid. The bail-out below is what makes the missing list safe.
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const styles = getComputedStyle(element)
    const next = Object.fromEntries(
      names.map((name) => [name, styles.getPropertyValue(name).trim()])
    )
    setValues((current) =>
      names.length === Object.keys(current).length && names.every((n) => current[n] === next[n])
        ? current
        : next
    )
  })

  return { ref, values }
}

/* ------------------------------------------------------------------ *
 * Presentation
 * ------------------------------------------------------------------ */

/** A card-shaped panel painted with the token surfaces themselves. */
function TokenSurface({ children }: { children: ReactNode }) {
  return (
    <Box
      style={{
        background: 'var(--liebe-bg)',
        borderRadius: 'var(--liebe-card-radius)',
        padding: 'var(--liebe-card-padding)',
      }}
    >
      <Box
        style={{
          background: 'var(--liebe-card-bg)',
          borderRadius: 'var(--liebe-card-radius)',
          border: 'var(--liebe-card-border)',
          boxShadow: 'var(--liebe-card-shadow)',
          color: 'var(--liebe-fg)',
          padding: 'var(--liebe-card-padding)',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

/** Colour chip; decorative, so it is hidden from the accessibility tree. */
function Swatch({ value, style }: { value: string; style?: CSSProperties }) {
  return (
    <Box
      aria-hidden
      style={{
        background: value,
        border: '1px solid var(--liebe-hairline)',
        borderRadius: 'var(--liebe-control-radius)',
        height: 28,
        width: 44,
        ...style,
      }}
    />
  )
}

/** Surface tokens that are not colours, and the property each one drives. */
const surfaceSampleProperty: Record<string, keyof CSSProperties> = {
  '--liebe-card-border': 'border',
  '--liebe-card-blur': 'backdropFilter',
  '--liebe-card-shadow': 'boxShadow',
}

/** Renders a token's value the way that value is best judged. */
function TokenSample({ group, name, value }: { group: TokenGroup; name: string; value: string }) {
  if (group.preview === 'length') {
    // Radii are shown as the radius itself; the remaining lengths are sizes, so
    // the box takes the value as its width.
    const isRadius = name.endsWith('-radius')
    return (
      <Box
        aria-hidden
        style={{
          background: 'var(--liebe-c-default-tint)',
          border: '1px solid var(--liebe-c-default)',
          borderRadius: isRadius ? value : 'var(--liebe-control-radius)',
          height: 28,
          width: isRadius ? 44 : value,
        }}
      />
    )
  }

  if (group.preview === 'text') {
    return (
      <Text
        aria-hidden
        size="2"
        style={
          {
            fontFamily: name === '--liebe-font-numeric' ? value : 'var(--liebe-font-family)',
            letterSpacing: 'var(--liebe-letter-spacing)',
            textTransform: 'var(--liebe-text-transform)',
          } as CSSProperties
        }
      >
        Aa 123
      </Text>
    )
  }

  const property = surfaceSampleProperty[name]
  if (property) {
    return (
      <Box
        aria-hidden
        style={{
          background: 'var(--liebe-card-bg)',
          borderRadius: 'var(--liebe-control-radius)',
          height: 28,
          width: 44,
          [property]: value,
        }}
      />
    )
  }

  return <Swatch value={value} />
}

function TokenTable({ group }: { group: TokenGroup }) {
  const names = group.tokens.map((token) => token.name)
  const { ref, values } = useResolvedTokens(names)

  return (
    <Box ref={ref}>
      <Heading as="h3" size="3" mb="1">
        {group.title}
      </Heading>
      <Text as="p" size="2" mb="2" style={{ color: 'var(--liebe-muted)' }}>
        {group.description}
      </Text>
      <Table.Root size="1" variant="ghost">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Token</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Resolved value</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Sample</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Purpose</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {group.tokens.map((token) => (
            <Table.Row key={token.name}>
              <Table.RowHeaderCell>
                <Code size="1">{token.name}</Code>
              </Table.RowHeaderCell>
              <Table.Cell>
                <Code size="1" variant="ghost">
                  {values[token.name] || '—'}
                </Code>
              </Table.Cell>
              <Table.Cell>
                <TokenSample group={group} name={token.name} value={values[token.name] ?? ''} />
              </Table.Cell>
              <Table.Cell>
                <Text size="1">{token.purpose}</Text>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  )
}

/** The active/inactive treatment every anatomy part reuses, one row per domain. */
function DomainColorTable() {
  const names = domainColors.flatMap(({ name }) => Object.values(domainColorTokens(name)))
  const { ref, values } = useResolvedTokens(names)

  return (
    <Box ref={ref}>
      <Heading as="h3" size="3" mb="1">
        Domain colours
      </Heading>
      <Text as="p" size="2" mb="2" style={{ color: 'var(--liebe-muted)' }}>
        Each domain is a triplet: the base hue, a 20% tint derived from it, and a text step. Remap
        the base and the tint follows; under the Default theme the text step is pinned, so remap it
        too. The active swatch renders the shipped pattern, whose glyph step is per appearance — the
        base hue in dark, the text step in light, where a base-step glyph on a 20% tint of itself
        measures as little as 1.40:1.
      </Text>
      <Table.Root size="1" variant="ghost">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Token</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Radix scale</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Spec reference</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Active</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Inactive</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>State text</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Meaning</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {domainColors.map((domain) => {
            const tokens = domainColorTokens(domain.name)
            return (
              <Table.Row key={domain.name}>
                <Table.RowHeaderCell>
                  <Code size="1">{tokens.base}</Code>
                </Table.RowHeaderCell>
                <Table.Cell>
                  <Badge color="gray" variant="soft">
                    {domain.scale} 9 / 11
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Flex align="center" gap="2">
                    <Swatch value={domain.reference} style={{ width: 28 }} />
                    <Code size="1" variant="ghost">
                      {domain.reference}
                    </Code>
                  </Flex>
                </Table.Cell>
                <Table.Cell>
                  <IconCircle color={domain.name} domain={domain.name} active>
                    <GlyphDot />
                  </IconCircle>
                </Table.Cell>
                <Table.Cell>
                  <IconCircle color={domain.name} domain={domain.name}>
                    <GlyphDot />
                  </IconCircle>
                </Table.Cell>
                <Table.Cell>
                  <Text size="2" style={{ color: values[tokens.text] }}>
                    On
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="1">{domain.meaning}</Text>
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  )
}

/**
 * A stand-in for whatever glyph a card puts in the circle: a solid dot in the
 * glyph colour, so the swatch shows the colour the shipped pattern resolves
 * rather than one the gallery picked for itself.
 */
function GlyphDot() {
  return <Box style={{ background: 'currentcolor', borderRadius: '50%', height: 14, width: 14 }} />
}

/** Side-by-side reference hex and resolved alias, per surface token. */
function AliasFidelityTable({ appearance }: { appearance: 'dark' | 'light' }) {
  const names = surfaceReferences.map((surface) => surface.name)
  const { ref, values } = useResolvedTokens(names)

  return (
    <Box ref={ref}>
      <Table.Root size="1" variant="ghost">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Token</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Spec reference</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Radix alias</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {surfaceReferences.map((surface) => (
            <Table.Row key={surface.name}>
              <Table.RowHeaderCell>
                <Code size="1">{surface.name}</Code>
              </Table.RowHeaderCell>
              <Table.Cell>
                <Flex align="center" gap="2">
                  <Swatch value={surface[appearance]} />
                  <Code size="1" variant="ghost">
                    {surface[appearance]}
                  </Code>
                </Flex>
              </Table.Cell>
              <Table.Cell>
                <Flex align="center" gap="2">
                  <Swatch value={values[surface.name] ?? ''} />
                  <Code size="1" variant="ghost">
                    {values[surface.name] || '—'}
                  </Code>
                </Flex>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  )
}

/** One appearance's worth of reference, wrapped in its own Radix theme. */
function AppearancePane({
  appearance,
  title,
  children,
}: {
  appearance: 'dark' | 'light'
  title?: string
  children: ReactNode
}) {
  return (
    <Theme appearance={appearance} className="liebe-root" style={{ minWidth: 0 }}>
      <TokenSurface>
        {title ? (
          <Heading as="h2" size="4" mb="3">
            {title}
          </Heading>
        ) : null}
        {children}
      </TokenSurface>
    </Theme>
  )
}

/* ------------------------------------------------------------------ *
 * Stories
 * ------------------------------------------------------------------ */

/**
 * The `--liebe-*` token contract — the public theming API every component reads
 * and every theme overrides.
 *
 * Values are read off the live cascade, so what the tables show is what the
 * panel gets: the stylesheet is injected into the panel's shadow root and
 * imported into this preview from the same two files
 * (`src/styles/tokens.css` + `src/theme/themes/default.css`).
 */
const meta: Meta = {
  title: 'Design System/Tokens',
}

export default meta
type Story = StoryObj

/** Every non-colour token, resolved in the appearance chosen in the toolbar. */
export const Reference: Story = {
  render: () => (
    <TokenSurface>
      <Flex direction="column" gap="5">
        {tokenGroups.map((group) => (
          <TokenTable key={group.id} group={group} />
        ))}
      </Flex>
    </TokenSurface>
  ),
}

/** The domain colour triplets and the active/inactive treatment they drive. */
export const DomainColors: Story = {
  render: () => (
    <TokenSurface>
      <DomainColorTable />
    </TokenSurface>
  ),
}

/**
 * Both appearances at once — the review surface for the token set, since a
 * token is only right if it is right in dark and light.
 */
export const BothAppearances: Story = {
  render: () => (
    <Flex direction={{ initial: 'column', md: 'row' }} gap="4" align="start">
      {(['dark', 'light'] as const).map((appearance) => (
        <Box key={appearance} style={{ flex: 1, minWidth: 0 }}>
          <AppearancePane appearance={appearance} title={appearance === 'dark' ? 'Dark' : 'Light'}>
            <Flex direction="column" gap="5">
              {tokenGroups.map((group) => (
                <TokenTable key={group.id} group={group} />
              ))}
              <DomainColorTable />
            </Flex>
          </AppearancePane>
        </Box>
      ))}
    </Flex>
  ),
}

/**
 * The evidence behind the spec's resolved "Radix alias fidelity" question: each
 * surface token's design reference beside the Radix scale step it aliases.
 *
 * Dark matches within a hair. Light does too — but only because the ground
 * aliases `--gray-3` rather than the semantic `--color-background`, which is
 * plain white in light and identical to `--color-panel-solid`, i.e. it would
 * erase the ground-to-card separation the design depends on.
 */
export const AliasFidelity: Story = {
  render: () => (
    <Flex direction={{ initial: 'column', md: 'row' }} gap="4" align="start">
      {(['dark', 'light'] as const).map((appearance) => (
        <Box key={appearance} style={{ flex: 1, minWidth: 0 }}>
          <AppearancePane appearance={appearance} title={appearance === 'dark' ? 'Dark' : 'Light'}>
            <AliasFidelityTable appearance={appearance} />
          </AppearancePane>
        </Box>
      ))}
    </Flex>
  ),
}
