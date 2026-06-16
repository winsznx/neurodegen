/**
 * Deterministic JSON serialization for reasoning hash and other places where
 * two runs must produce byte-identical output given equivalent input.
 *
 * Rules:
 *  - Object keys are sorted lexicographically at every level.
 *  - Arrays preserve order (semantically meaningful).
 *  - `undefined` values and properties are omitted (matches JSON.stringify).
 *  - `bigint` values are serialized as their decimal string ("1n" → "1").
 *  - `Date` values are serialized as their ISO string.
 *  - Cycles throw — refusing to silently lie about a graph is better than
 *    pretending the hash means anything.
 */
export function canonicalize(value: unknown): string {
  const seen = new WeakSet<object>();

  function walk(v: unknown): unknown {
    if (v === null) return null;
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) {
      return v.map(walk);
    }
    if (typeof v === 'object') {
      if (seen.has(v)) {
        throw new Error('canonicalize: cycle detected');
      }
      seen.add(v);
      const out: Record<string, unknown> = {};
      const keys = Object.keys(v as Record<string, unknown>).sort();
      for (const k of keys) {
        const cv = (v as Record<string, unknown>)[k];
        if (cv === undefined) continue;
        out[k] = walk(cv);
      }
      return out;
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) {
        throw new Error(
          `canonicalize: non-finite number (${String(v)}) cannot serialize deterministically`,
        );
      }
      return v;
    }
    return v;
  }

  return JSON.stringify(walk(value));
}

/**
 * Sugar over canonicalize() for objects that don't tolerate the cycle check
 * (e.g. you've already cloned safely upstream) — same output.
 */
export function canonicalizeShape<T>(value: T): string {
  return canonicalize(value);
}
