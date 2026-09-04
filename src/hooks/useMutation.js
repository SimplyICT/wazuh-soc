import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Wraps @tanstack/react-query useMutation for SOC API mutations.
 * Automatically invalidates related queries on success.
 *
 * @param {Function} mutationFn - async function receiving the mutation payload
 * @param {Object} options
 * @param {string|string[]} options.invalidateKeys - query key prefixes to invalidate on success
 * @param {Function} [options.onSuccess] - extra callback after invalidation
 * @param {Function} [options.onError] - error callback
 */
export function useSocMutation(mutationFn, { invalidateKeys = [], onSuccess, onError } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: async () => {
      if (invalidateKeys.length) {
        const keys = Array.isArray(invalidateKeys) ? invalidateKeys : [invalidateKeys];
        // Use predicate to match query keys of the form ['api', derivedKey, ...deps]
        // since useApi auto-derives the key from the fetch function source.
        await Promise.all(keys.map(k => queryClient.invalidateQueries({
          predicate: (query) => {
            const qk = query.queryKey;
            return Array.isArray(qk) && qk[0] === 'api' && typeof qk[1] === 'string' && qk[1].includes(k);
          },
        })));
      }
      if (onSuccess) onSuccess();
    },
    onError,
  });
}
