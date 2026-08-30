import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Plus, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Pagination } from '@/components/Pagination';
import { ProductStatusBadge, StockStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCategories } from '@/api/categories';
import { useCatalog, useDeleteProduct } from '@/api/products';
import { useExportExcel } from '@/api/excel';
import { formatCurrency } from '@/lib/utils';
import type { CatalogListItemDto, ProductStatus, StockStatus } from '@swoonrush/shared';

const ALL = '__all__';

export function ProductListPage() {
  const navigate = useNavigate();
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [categoryId, setCategoryId] = React.useState<string>(ALL);
  const [status, setStatus] = React.useState<string>(ALL);
  const [stockStatus, setStockStatus] = React.useState<string>(ALL);
  const [deleteTarget, setDeleteTarget] = React.useState<CatalogListItemDto | null>(null);

  const { data: categories } = useCategories();
  const { data, isPending, isError, error, refetch } = useCatalog({
    page,
    limit,
    search: search || undefined,
    categoryId: categoryId === ALL ? undefined : categoryId,
    status: status === ALL ? undefined : (status as ProductStatus),
    stockStatus: stockStatus === ALL ? undefined : (stockStatus as StockStatus),
  });
  const deleteMutation = useDeleteProduct();
  const exportMutation = useExportExcel();

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Product deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete product');
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description="Manage your catalog of sellable SKUs"
        actions={
          <>
            <Button variant="outline" onClick={() => exportMutation.mutate({ kind: 'products' })}>
              <Upload className="h-4 w-4" /> Export
            </Button>
            <Button asChild>
              <Link to="/products/new">
                <Plus className="h-4 w-4" /> Add Product
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, SKU, size, color…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={categoryId}
          onValueChange={(v) => {
            setCategoryId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
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
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          icon={Package}
          title="No products found"
          description="Try adjusting your filters, or add your first product."
          action={
            <Button asChild>
              <Link to="/products/new">Add Product</Link>
            </Button>
          }
        />
      )}

      {data && data.items.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Image</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Purchase</TableHead>
                <TableHead className="text-right">Selling</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => navigate(item.isGroup ? `/products/groups/${item.id}` : `/products/${item.id}`)}
                >
                  <TableCell>
                    {item.primaryImageUrl ? (
                      <img
                        src={item.primaryImageUrl}
                        alt={item.name}
                        className="h-10 w-10 rounded-md border object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {item.name}
                    {item.isGroup && (
                      <span className="ml-2 text-xs font-normal text-primary">
                        {item.variantCount} variant{item.variantCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.sku ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{item.categoryName ?? '—'}</TableCell>
                  <TableCell>{item.size ?? '—'}</TableCell>
                  <TableCell>{item.color ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.purchasePrice)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(item.sellingPrice)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="tabular-nums text-muted-foreground">{item.stockQuantity}</span>
                      <StockStatusBadge status={item.stockStatus} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <ProductStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {item.isGroup ? (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/products/groups/${item.id}`}>View</Link>
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/products/${item.id}/edit`}>Edit</Link>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(item)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination pagination={data.pagination} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone. Products with order or stock history can't be deleted — archive them instead."
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
