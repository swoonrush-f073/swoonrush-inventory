import * as React from 'react';
import { Link } from 'react-router-dom';
import { Boxes, ChevronDown, ChevronRight, History, Search } from 'lucide-react';
import type { InventoryCatalogItemDto } from '@swoonrush/shared';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Pagination } from '@/components/Pagination';
import { ProductStatusBadge, StockStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useGroupVariantsInventory, useInventoryCatalog } from '@/api/inventory';
import { formatDateTime } from '@/lib/utils';
import { AdjustStockDialog, StockInDialog } from './StockActionDialogs';

const ALL = '__all__';

type StockTarget = { id: string; sku: string; name: string; stockQuantity: number };

function GroupVariantRows({
  groupId,
  onStockIn,
  onAdjust,
}: {
  groupId: string;
  onStockIn: (target: StockTarget) => void;
  onAdjust: (target: StockTarget) => void;
}) {
  const { data, isPending } = useGroupVariantsInventory(groupId, true);

  if (isPending) {
    return (
      <TableRow>
        <TableCell colSpan={9}>
          <Skeleton className="h-8 w-full" />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {data?.items.map((variant) => (
        <TableRow key={variant.id} className="bg-muted/40">
          <TableCell className="pl-8 text-muted-foreground">↳</TableCell>
          <TableCell className="text-muted-foreground">{variant.sku}</TableCell>
          <TableCell>{variant.size ?? '—'}</TableCell>
          <TableCell>{variant.color ?? '—'}</TableCell>
          <TableCell className="text-right tabular-nums">{variant.stockQuantity}</TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">
            {variant.lowStockLimit}
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <StockStatusBadge status={variant.stockStatus} />
              <ProductStatusBadge status={variant.status} />
            </div>
          </TableCell>
          <TableCell className="text-muted-foreground">{formatDateTime(variant.updatedAt)}</TableCell>
          <TableCell className="text-right">
            <Button variant="ghost" size="sm" onClick={() => onStockIn(variant)}>
              Stock In
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onAdjust(variant)}>
              Adjust
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/inventory/movements?productId=${variant.id}`}>History</Link>
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function InventoryPage() {
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [stockStatus, setStockStatus] = React.useState(ALL);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [stockInTarget, setStockInTarget] = React.useState<StockTarget | null>(null);
  const [adjustTarget, setAdjustTarget] = React.useState<StockTarget | null>(null);

  const { data, isPending, isError, error, refetch } = useInventoryCatalog({
    page,
    limit,
    search: search || undefined,
    stockStatus: stockStatus === ALL ? undefined : (stockStatus as InventoryCatalogItemDto['stockStatus']),
  });

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Current stock levels for every product"
        actions={
          <Button variant="outline" asChild>
            <Link to="/inventory/movements">
              <History className="h-4 w-4" /> Stock History
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search product or SKU…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={stockStatus}
          onValueChange={(v) => {
            setStockStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Stock</SelectItem>
            <SelectItem value="IN_STOCK">In Stock</SelectItem>
            <SelectItem value="LOW">Low Stock</SelectItem>
            <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError && <ErrorState message={(error as Error).message} onRetry={() => refetch()} />}

      {isPending && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && <EmptyState icon={Boxes} title="No products found" />}

      {data && data.items.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead className="text-right">Low Stock Limit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell className="font-medium">
                      {item.isGroup ? (
                        <button
                          type="button"
                          className="flex items-center gap-1.5"
                          onClick={() => toggleExpanded(item.id)}
                        >
                          {expanded.has(item.id) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          {item.name}
                          <span className="text-xs font-normal text-primary">
                            {item.variantCount} variant{item.variantCount === 1 ? '' : 's'}
                          </span>
                        </button>
                      ) : (
                        item.name
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.sku ?? '—'}</TableCell>
                    <TableCell>{item.size ?? '—'}</TableCell>
                    <TableCell>{item.color ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.stockQuantity}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {item.lowStockLimit ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <StockStatusBadge status={item.stockStatus} />
                        <ProductStatusBadge status={item.status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(item.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      {!item.isGroup && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setStockInTarget({ id: item.id, sku: item.sku!, name: item.name, stockQuantity: item.stockQuantity })
                            }
                          >
                            Stock In
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setAdjustTarget({ id: item.id, sku: item.sku!, name: item.name, stockQuantity: item.stockQuantity })
                            }
                          >
                            Adjust
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/inventory/movements?productId=${item.id}`}>History</Link>
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                  {item.isGroup && expanded.has(item.id) && (
                    <GroupVariantRows groupId={item.id} onStockIn={setStockInTarget} onAdjust={setAdjustTarget} />
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
          <Pagination pagination={data.pagination} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      )}

      <StockInDialog product={stockInTarget} onOpenChange={(open) => !open && setStockInTarget(null)} />
      <AdjustStockDialog product={adjustTarget} onOpenChange={(open) => !open && setAdjustTarget(null)} />
    </div>
  );
}
