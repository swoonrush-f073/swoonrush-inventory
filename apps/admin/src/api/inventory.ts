import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  InventoryCatalogItemDto,
  InventoryListItemDto,
  InventoryMovementDto,
  InventoryQuery,
  MovementQuery,
  PaginatedResult,
  ProductDetailDto,
  StockAdjustInput,
  StockDamageInput,
  StockInInput,
} from '@swoonrush/shared';
import { apiClient } from './client';

export function useInventory(query: Partial<InventoryQuery> = {}) {
  return useQuery({
    queryKey: ['inventory', query],
    queryFn: () => apiClient.get<PaginatedResult<InventoryListItemDto>>('/inventory', query),
  });
}

export function useInventoryCatalog(query: Partial<InventoryQuery> = {}) {
  return useQuery({
    queryKey: ['inventory', 'catalog', query],
    queryFn: () => apiClient.get<PaginatedResult<InventoryCatalogItemDto>>('/inventory/catalog', query),
  });
}

export function useGroupVariantsInventory(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['inventory', 'group-variants', groupId],
    queryFn: () => apiClient.get<PaginatedResult<InventoryListItemDto>>('/inventory', { groupId, limit: 100 }),
    enabled,
  });
}

export function useLowStock(query: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['inventory', 'low-stock', query],
    queryFn: () => apiClient.get<PaginatedResult<InventoryListItemDto>>('/inventory/low-stock', query),
  });
}

export function useMovements(query: Partial<MovementQuery> = {}) {
  return useQuery({
    queryKey: ['inventory', 'movements', query],
    queryFn: () => apiClient.get<PaginatedResult<InventoryMovementDto>>('/inventory/movements', query),
  });
}

function useInvalidateInventory() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    // Stock changes shift stat cards like Total Inventory Value / Total
    // Damaged Stock Value, both sourced from GET /reports/inventory.
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  };
}

export function useStockIn() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: (input: StockInInput) => apiClient.post<ProductDetailDto>('/inventory/stock-in', input),
    onSuccess: invalidate,
  });
}

export function useStockAdjust() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: (input: StockAdjustInput) => apiClient.post<ProductDetailDto>('/inventory/adjust', input),
    onSuccess: invalidate,
  });
}

export function useStockDamage() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: (input: StockDamageInput) => apiClient.post<ProductDetailDto>('/inventory/damage', input),
    onSuccess: invalidate,
  });
}
