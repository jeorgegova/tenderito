/**
 * useMutationWithSync
 *
 * Wrapper sobre useMutation de React Query que, al completar con éxito
 * una mutación, invalida automáticamente todas las queries relevantes
 * del dominio de Tenderito.
 *
 * Esto asegura que cualquier pantalla que dependa de los datos actualizados
 * se refresque de forma inmediata, sin necesidad de llamar refetch() manualmente.
 */
import {useMutation, useQueryClient, type UseMutationOptions} from '@tanstack/react-query';

/** Conjunto de query keys que se invalidan después de cualquier mutación de negocio */
const SYNC_QUERY_KEYS = [
  ['customers'],
  ['customers-all'],
  ['total-receivable'],
  ['overdue'],
  ['stats'],
] as const;

/** Query keys que solo se invalidan cuando el customerId es conocido */
function customerScopedKeys(customerId?: string) {
  if (!customerId) return [];
  return [
    ['customer', customerId],
    ['credits', customerId],
    ['payments', customerId],
    ['customer-global-history', customerId],
  ];
}

export interface MutationWithSyncOptions<TData, TError, TVariables, TContext>
  extends Omit<UseMutationOptions<TData, TError, TVariables, TContext>, 'onSuccess'> {
  /** customer_id para invalidar queries con scope de cliente */
  customerId?: string;
  /** Callback adicional que se ejecuta después de la invalidación */
  onSuccess?: (data: TData, variables: TVariables, context: TContext) => void | Promise<void>;
}

export function useMutationWithSync<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: MutationWithSyncOptions<TData, TError, TVariables, TContext>,
) {
  const queryClient = useQueryClient();

  return useMutation<TData, TError, TVariables, TContext>({
    ...options,
    mutationFn,
    onSuccess: async (data, variables, context) => {
      // 1. Invalidar queries globales de dominio
      await Promise.all(
        SYNC_QUERY_KEYS.map(key =>
          queryClient.invalidateQueries({queryKey: key}),
        ),
      );

      // 2. Invalidar queries con scope de cliente si se conoce el id
      const customerId =
        options?.customerId ||
        (typeof variables === 'object' &&
        variables !== null &&
        'customer_id' in (variables as object)
          ? (variables as any).customer_id
          : undefined);

      if (customerId) {
        await Promise.all(
          customerScopedKeys(customerId).map(key =>
            queryClient.invalidateQueries({queryKey: key}),
          ),
        );
      }

      // 3. Callback adicional del caller
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
