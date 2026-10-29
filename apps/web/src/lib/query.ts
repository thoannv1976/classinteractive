import { QueryClient, useMutation, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api, errorMessage } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

/** GET an API path with caching. The query key is the path itself. */
export function useApi<T>(path: string | null, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api.get<T>(path!),
    enabled: !!path,
    ...opts,
  });
}

/** Invalidate every cached GET whose path starts with one of the prefixes. */
export function invalidate(...prefixes: string[]) {
  return queryClient.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === 'string' && prefixes.some((p) => (q.queryKey[0] as string).startsWith(p)),
  });
}

/** Mutation helper with toast feedback. */
export function useAction<TArgs, TResult = unknown>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: string[]; onSuccess?: (r: TResult) => void; silent?: boolean } = {},
) {
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      if (opts.invalidate?.length) await invalidate(...opts.invalidate);
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e) => {
      if (!opts.silent) toast.error(errorMessage(e));
    },
  });
}
