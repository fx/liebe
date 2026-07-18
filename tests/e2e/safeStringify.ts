// Depth-limited, cycle-safe stringifier for arbitrary page-side values.
// Self-contained BY DESIGN: it is serialized into the page twice — embedded
// into helpers.ts's init-script rejection recorder, and evaluated against
// console argument handles whose jsonValue() rejects (circular structures like
// hls.js ErrorData) — so it must not reference anything outside its own body.
// Errors stringify to their stack; TRUE ancestor cycles become '[circular]';
// depth is capped so a huge object graph (hls.js ErrorData drags in fragments,
// loaders, buffers) still yields a bounded, inspectable string whose top-level
// fields (type, details, fatal, ...) always survive.
//
// Cycle detection uses a PATH STACK (add before recursing into an object,
// delete after), not a visited set: a visited set never forgets, so a DAG —
// the same non-circular object reached via two sibling fields — would
// serialize the second reference as '[circular]', potentially hiding the very
// type/details/fatal fields the benign filters inspect. With the path stack,
// shared siblings serialize fully (the depth limit still bounds total size)
// and only genuine ancestor cycles are marked.
export function safeStringify(value: unknown, maxDepth: number = 4): string {
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
      if (Array.isArray(input)) return input.map((item) => encode(item, depth + 1))
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
      if (input instanceof Map) {
        for (const [key, val] of input.entries()) assign(`[map] ${String(key)}`, () => val)
      } else if (input instanceof Set) {
        ;[...input.values()].forEach((val, index) => assign(`[set] ${index}`, () => val))
      } else {
        for (const key of Object.keys(input)) {
          assign(key, () => (input as Record<string, unknown>)[key])
        }
      }
      return record
    } finally {
      stack.delete(input)
    }
  }
  const encoded = encode(value, 0)
  return typeof encoded === 'string' ? encoded : JSON.stringify(encoded)
}
