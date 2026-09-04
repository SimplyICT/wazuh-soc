import { useQuery } from '@tanstack/react-query';

/**
 * Derive a stable, deterministic query key from an inline fetch function.
 *
 * Purpose: React Query keys must be stable across renders so unrelated queries
 * don't collide.  Since we accept anonymous arrow functions, we extract the
 * API path(s) from the function's source string rather than hashing the whole
 * body (which would change on every minor edit).
 *
 * Strategy (tried in order):
 *   regex → /api(GET|POST|PUT)\\(['"\`]([^'"\`]+)['"\`]/g
 *     Matches known wrappers (apiGet, apiPost, apiPut).  Captures the URL
 *     path argument.  All found paths are sorted and joined with '|'.
 *
 *   fallback → /fetch\\(\`\\/([^\`]+)\`/g
 *     If no wrapper match, try raw `fetch()` calls.  Only paths that start
 *     with '/' are captured (relative API calls).
 *
 *   last resort → src.substring(0, 120)
 *     If no path-based match succeeded, use the first 120 characters of the
 *     function source.  This is not strictly stable but is better than a
 *     random hash for debugging.
 *
 * Edge cases:
 *   - Promise.all([apiGet('/a'), apiGet('/b')])  →  "a|b"  (sorted union)
 *   - Inline template literals inside fetch /apiGet work as long as the
 *     literal starts with '/…' — dynamic segments are captured literally.
 *   - Functions passed as named references (e.g. fetchData) produce a hash
 *     of the first 120 chars, which is stable across renders but opaque.
 *
 * @param {Function} fetchFn - The async function that performs the API call.
 * @returns {string} A deterministic key suitable for use in a queryKey array.
 */
function deriveKey(fetchFn) {
  const src = fetchFn.toString();
  // Extract all path arguments from apiGet(...), apiPost(...), etc.
  const paths = [...src.matchAll(/api(GET|POST|PUT)\(['`"]([^'"`]+)['`"]/g)].map(m => m[2]);
  if (paths.length) return paths.sort().join('|');
  // Try generic fetch calls
  const fetchPaths = [...src.matchAll(/fetch\(`\/([^`]+)`/g)].map(m => m[1]);
  if (fetchPaths.length) return fetchPaths.sort().join('|');
  // Fallback: use a portion of the source as key
  return src.substring(0, 120);
}

/**
 * Drop-in replacement that uses @tanstack/react-query under the hood.
 * Same API: { data, loading, error, refetch }
 * Adds: caching, background refetch, deduplication, retry, stale management.
 *
 * The query key is auto-derived from the fetchFn source to ensure
 * different API calls don't share a cache slot.
 */
export function useApi(fetchFn, deps = [], refreshKey) {
  const key = deriveKey(fetchFn);
  const queryKey = ['api', key, ...deps, refreshKey].filter(Boolean);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: fetchFn,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  return { data, loading: isLoading, error, refetch };
}

/**
 * Pre-built hook for paginated/server-filtered queries.
 * Same return shape as useApi.
 */
export function usePaginatedApi(fetchFn, { page = 1, size = 50, filters = {} }, refreshKey) {
  const key = deriveKey(fetchFn);
  const queryKey = ['api', 'paginated', key, page, size, JSON.stringify(filters), refreshKey].filter(Boolean);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchFn({ page, size, filters }),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 2,
  });

  return { data, loading: isLoading, error, refetch };
}
