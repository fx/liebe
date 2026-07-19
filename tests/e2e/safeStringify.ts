// Depth-limited, cycle-safe, BUDGETED stringifier for arbitrary page-side
// values. Self-contained BY DESIGN: it is serialized into the page twice —
// embedded into helpers.ts's init-script rejection recorder, and evaluated
// against console argument handles whose jsonValue() rejects (circular
// structures like hls.js ErrorData) — so it must not reference anything
// outside its own body. Errors stringify to their stack; TRUE ancestor cycles
// become '[circular]'; depth is capped so a huge object graph (hls.js
// ErrorData drags in fragments, loaders, buffers) still yields a bounded,
// inspectable string whose top-level fields (type, details, fatal, ...)
// always survive.
//
// Cycle detection uses a PATH STACK (add before recursing into an object,
// delete after), not a visited set: a visited set never forgets, so a DAG —
// the same non-circular object reached via two sibling fields — would
// serialize the second reference as '[circular]', potentially hiding the very
// type/details/fatal fields the benign filters inspect. With the path stack,
// shared siblings serialize fully and only genuine ancestor cycles are marked.
//
// Size budgets: the depth cap alone does NOT bound WIDE containers (a typed
// array or 1M-entry array at depth 1 would serialize entirely, hanging the
// in-page evaluation), so every container is additionally capped at
// maxEntries per level with an explicit truncation marker, and the final
// string is capped at maxLength — deterministic markers, never silent loss.
export function safeStringify(
  value: unknown,
  maxDepth: number = 4,
  maxEntries: number = 50,
  maxLength: number = 20_000
): string {
  const stack = new WeakSet<object>()
  const encode = (input: unknown, depth: number): unknown => {
    if (typeof input === 'function') return `[function ${input.name || 'anonymous'}]`
    if (input === null || typeof input !== 'object') {
      if (typeof input === 'bigint') return `${input}n`
      if (typeof input === 'symbol') return input.toString()
      if (input === undefined) return '[undefined]'
      return input
    }
    if (input instanceof Error) return input.stack || `${input.name}: ${input.message}`
    if (stack.has(input)) return '[circular]'
    if (depth >= maxDepth) return '[depth limit]'
    stack.add(input)
    try {
      if (Array.isArray(input)) {
        const items: unknown[] = input.slice(0, maxEntries).map((item) => encode(item, depth + 1))
        if (input.length > maxEntries) {
          items.push(`[+${input.length - maxEntries} more entries]`)
        }
        return items
      }
      if (input instanceof Date) return input.toISOString()
      const record: Record<string, unknown> = {}
      // The property READ stays inside the guarded path too: a throwing
      // getter must degrade that one field to '[unreadable]' instead of
      // aborting the whole stringification (which would collapse the entry
      // to the unmatchable serialization-failure placeholder).
      const assign = (key: string, read: () => unknown) => {
        try {
          record[key] = encode(read(), depth + 1)
        } catch {
          record[key] = '[unreadable]'
        }
      }
      const truncate = (total: number) => {
        if (total > maxEntries) {
          record['[truncated]'] = `+${total - maxEntries} more entries`
        }
      }
      // Map/Set entries are pulled lazily from the iterator, stopping at
      // maxEntries: spreading first (`[...map].slice(...)`) would materialize
      // the ENTIRE collection before truncating, defeating the budget for
      // huge collections — and the collector's 2s outer timeout cannot cancel
      // in-page work already underway.
      if (input instanceof Map) {
        let count = 0
        for (const [key, val] of input) {
          if (count >= maxEntries) break
          count += 1
          assign(`[map] ${String(key)}`, () => val)
        }
        truncate(input.size)
      } else if (input instanceof Set) {
        let index = 0
        for (const val of input) {
          if (index >= maxEntries) break
          assign(`[set] ${index}`, () => val)
          index += 1
        }
        truncate(input.size)
      } else {
        const keys = Object.keys(input)
        for (const key of keys.slice(0, maxEntries)) {
          assign(key, () => (input as Record<string, unknown>)[key])
        }
        truncate(keys.length)
      }
      return record
    } finally {
      stack.delete(input)
    }
  }
  const encoded = encode(value, 0)
  const text = typeof encoded === 'string' ? encoded : JSON.stringify(encoded)
  // Output budget: hard cap with a deterministic marker. Top-level fields
  // (type/details/fatal) serialize first, so the inspectable prefix survives.
  return text.length > maxLength ? `${text.slice(0, maxLength)}[output truncated]` : text
}
