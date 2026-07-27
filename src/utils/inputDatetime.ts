/**
 * Format translation for `input_datetime` helpers.
 *
 * Home Assistant publishes a helper's state as `YYYY-MM-DD`, `HH:MM:SS`, or the
 * space-separated `YYYY-MM-DD HH:MM:SS`, and accepts `input_datetime.set_datetime`
 * with `date`, `time`, or `datetime` — the field set decided by the helper's own
 * `has_date`/`has_time`, with the wrong combination rejected outright. The native
 * inputs the card renders speak neither dialect: `<input type="datetime-local">`
 * emits and requires `YYYY-MM-DDTHH:mm`, and `<input type="time">` emits `HH:mm`.
 *
 * Both directions live here rather than in the card, so the card stays free of
 * service knowledge (docs/changes/0022-switch-input-helpers-to-spec.md).
 */

/**
 * The two attributes that decide which halves of a datetime a helper carries.
 * Typed `unknown` because that is how entity attributes reach here — the store
 * holds them untyped, and only `!== false` is ever asked of them.
 */
export interface InputDatetimeShape {
  // An entity's whole attribute bag is what callers have, so it is what this
  // takes — the two keys below are simply the ones read out of it.
  [attribute: string]: unknown
  has_date?: unknown
  has_time?: unknown
}

interface DatetimeParts {
  date?: string
  time?: string
}

const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?$/
const TIME_PATTERN = /^(\d{2}:\d{2}(?::\d{2})?)$/

/**
 * Split a value into its date and time halves, accepting either separator.
 * `null` for anything that is not a datetime at all — `unknown`, `''`, and the
 * `unavailable` state all land here, and none of them may reach a service call.
 */
function parseParts(value: string): DatetimeParts | null {
  const trimmed = value.trim()

  const dateMatch = DATE_PATTERN.exec(trimmed)
  if (dateMatch) return { date: dateMatch[1], time: dateMatch[2] }

  const timeMatch = TIME_PATTERN.exec(trimmed)
  if (timeMatch) return { time: timeMatch[1] }

  return null
}

/** Home Assistant wants whole seconds; the native inputs omit them. */
const withSeconds = (time: string) => (time.length === 5 ? `${time}:00` : time)

/** The native inputs reject a seconds component they did not ask for. */
const withoutSeconds = (time: string) => time.slice(0, 5)

/**
 * An absent attribute reads as present: Home Assistant always sends both, and
 * the card has always treated absence that way (`has_date !== false`).
 */
const resolveShape = (attributes?: InputDatetimeShape) => ({
  hasDate: attributes?.has_date !== false,
  hasTime: attributes?.has_time !== false,
})

/**
 * The `input_datetime.set_datetime` payload for a value coming out of the card's
 * input, or `null` when the value cannot serve the helper's shape — a time with
 * no date for a helper that carries a date, a helper carrying neither half, a
 * blank field. `null` means "do not call the service": a payload whose fields
 * disagree with `has_date`/`has_time` is an error from Home Assistant, so
 * sending nothing is strictly better than sending a guess.
 */
export function buildSetDatetimePayload(
  value: unknown,
  attributes?: InputDatetimeShape
): Record<string, string> | null {
  if (typeof value !== 'string') return null

  const parts = parseParts(value)
  if (!parts) return null

  const { hasDate, hasTime } = resolveShape(attributes)

  if (hasDate && hasTime) {
    if (!parts.date) return null
    // A combined helper whose input carried no time is set at midnight rather
    // than refused — the date is what the user chose, and `set_datetime`'s
    // `datetime` field has no half-value form.
    return { datetime: `${parts.date} ${withSeconds(parts.time ?? '00:00:00')}` }
  }

  if (hasDate) return parts.date ? { date: parts.date } : null
  if (hasTime) return parts.time ? { time: withSeconds(parts.time) } : null

  return null
}

/**
 * The value for the card's native input, given the helper's published state.
 * `''` for anything the input cannot represent, which is what a native input
 * does with a malformed value anyway — only now the card and the DOM agree on it.
 */
export function toDatetimeInputValue(state: string, attributes?: InputDatetimeShape): string {
  const parts = parseParts(state)
  if (!parts) return ''

  const { hasDate, hasTime } = resolveShape(attributes)

  if (hasDate && hasTime) {
    return parts.date ? `${parts.date}T${withoutSeconds(parts.time ?? '00:00')}` : ''
  }

  if (hasDate) return parts.date ?? ''
  if (hasTime) return parts.time ? withoutSeconds(parts.time) : ''

  return ''
}
