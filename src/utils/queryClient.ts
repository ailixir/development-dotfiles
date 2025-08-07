import { QueryClient } from '@tanstack/react-query';
import { ERROR_MESSAGES } from '@/utils/constants';

// Query client configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (previously cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error && 'status' in error && typeof error.status === 'number') {
          if (error.status >= 400 && error.status < 500) {
            return false;
          }
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
      onError: (error) => {
        console.error('Mutation error:', error);
        // Here you could integrate with a toast notification system
      },
    },
  },
});

// Global error handler for React Query
queryClient.setMutationDefaults(['checks'], {
  mutationFn: async () => {
    throw new Error('Mutation function not implemented');
  },
        onError: (error) => {
    console.error('Check mutation failed:', error);
  },
});

// Set default error messages
queryClient.setQueryDefaults(['checks'], {
  queryFn: async () => {
    throw new Error('Query function not implemented');
  },
  meta: {
    errorMessage: ERROR_MESSAGES.UNKNOWN_ERROR,
  },
});

export default queryClient;
