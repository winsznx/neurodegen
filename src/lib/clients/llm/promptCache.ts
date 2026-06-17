import { keccak256, stringToBytes } from 'viem';
import { canonicalize } from '@/lib/utils/canonicalSerialize';
import { LLM_CACHE_TTL_MS } from '@/config/cognition';
import type { LLMCallResult } from './claudeClient';

interface CachedEntry {
  result: LLMCallResult;
  expiresAt: number;
}

/**
 * In-memory LRU prompt cache keyed by keccak256 of canonical(systemPrompt + userContent + modelId).
 * Direct fix for NEURODEGEN_V1_AUDIT.md §3.4.5 ("No result caching"). When the
 * same prompt arrives within `LLM_CACHE_TTL_MS` (default 120s), we return the
 * cached result instead of round-tripping the provider.
 *
 * Memory-bounded at MAX_ENTRIES; evicts oldest first when full.
 */
class PromptCache {
  private store = new Map<string, CachedEntry>();
  private readonly maxEntries = 256;
  private hits = 0;
  private misses = 0;

  computeKey(systemPrompt: string, userContent: string, modelId: string): `0x${string}` {
    return keccak256(stringToBytes(canonicalize({ systemPrompt, userContent, modelId })));
  }

  get(key: `0x${string}`): LLMCallResult | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      this.misses += 1;
      return null;
    }
    // Refresh LRU recency: re-insert at tail.
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    return entry.result;
  }

  set(key: `0x${string}`, result: LLMCallResult): void {
    if (LLM_CACHE_TTL_MS <= 0) return;
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { result, expiresAt: Date.now() + LLM_CACHE_TTL_MS });
  }

  stats(): { hits: number; misses: number; size: number; hitRatio: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size,
      hitRatio: total > 0 ? this.hits / total : 0,
    };
  }

  reset(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

export const promptCache = new PromptCache();
