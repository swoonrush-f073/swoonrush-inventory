import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { ORDER_STATUS_TRANSITIONS, type OrderItemDto, type OrderStatus, type PaymentStatus } from '@swoonrush/shared';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrder, useUpdateOrderStatus, useUpdatePaymentStatus } from '@/api/orders';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { EditOrderDialog } from './EditOrderDialog';
import { EditOrderItemDialog } from './EditOrderItemDialog';
import { InvoiceActions } from './InvoiceActions';
import { OrderTimeline } from './OrderTimeline';

const PAYMENT_STATUSES: PaymentStatus[] = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'COD'];

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isPending, isError, error, refetch } = useOrder(id);
  const updateStatus = useUpdateOrderStatus(id ?? '');
  const updatePayment = useUpdatePaymentStatus(id ?? '');
  const [pendingTransition, setPendingTransition] = React.useState<OrderStatus | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<OrderItemDto | null>(null);

  async function handleStatusChange(status: OrderStatus) {
    try {
      await updateStatus.mutateAsync(status);
      toast.success(`Order marked as ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update order status');
    } finally {
      setPendingTransition(null);
    }
  }

  async function handlePaymentChange(status: PaymentStatus) {
    try {
      await updatePayment.mutateAsync(status);
      toast.success('Payment status updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update payment status');
    }
  }

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !order) {
    return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;
  }

  const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.orderStatus] ?? [];
  const isDestructiveTransition = (status: OrderStatus) => status === 'CANCELLED' || status === 'RETURNED';
  const isReopenTransition = (status: OrderStatus) => order.orderStatus === 'CANCELLED' && status === 'PENDING';
  const transitionLabel = (status: OrderStatus) => (isReopenTransition(status) ? 'Reopen Order' : `Mark as ${status}`);

  return (
    <div>
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={formatDateTime(order.orderDate)}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <InvoiceActions orderId={order.id} order={order} />
            {allowedTransitions.map((status) => (
              <Button
                key={status}
                variant={isDestructiveTransition(status) ? 'outline' : 'default'}
                className={isDestructiveTransition(status) ? 'text-destructive' : ''}
                onClick={() => setPendingTransition(status)}
              >
                {transitionLabel(status)}
              </Button>
            ))}
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4">
          <OrderTimeline status={order.orderStatus} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Products</CardTitle>
          </CardHeader>
          <CardContent>
            {order.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Stitching-only order — no products (customer supplied their own material).
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-9" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{item.sku}</p>
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.discount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.total)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${item.productName}`}
                          onClick={() => setEditingItem(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatCurrency(order.discount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>{formatCurrency(order.shippingFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCurrency(order.tax)}</span>
              </div>
              {order.stitchingCharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stitching charge</span>
                  <span>{formatCurrency(order.stitchingCharge)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-medium">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
            {order.notes && (
              <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">{order.notes}</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {order.customer ? (
                <>
                  <Link to={`/customers/${order.customer.id}`} className="font-medium hover:underline">
                    {order.customer.name}
                  </Link>
                  <p className="text-muted-foreground">{order.customer.phone}</p>
                  <p className="text-muted-foreground">{order.customer.email}</p>
                  {order.customer.address && <p className="text-muted-foreground">{order.customer.address}</p>}
                  <p className="text-muted-foreground">
                    {[order.customer.city, order.customer.state, order.customer.pincode].filter(Boolean).join(', ')}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">Walk-in customer</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Order Status</span>
                <OrderStatusBadge status={order.orderStatus} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Payment Status</span>
                <Select value={order.paymentStatus} onValueChange={(v) => handlePaymentChange(v as PaymentStatus)}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-1">
                <PaymentStatusBadge status={order.paymentStatus} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <EditOrderDialog order={order} open={editOpen} onOpenChange={setEditOpen} />

      {editingItem && (
        <EditOrderItemDialog
          orderId={order.id}
          item={editingItem}
          open={Boolean(editingItem)}
          onOpenChange={(open) => !open && setEditingItem(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingTransition)}
        onOpenChange={(open) => !open && setPendingTransition(null)}
        title={
          pendingTransition && isReopenTransition(pendingTransition)
            ? 'Reopen this order?'
            : `Mark order as ${pendingTransition}?`
        }
        description={
          pendingTransition && isReopenTransition(pendingTransition)
            ? 'This puts the order back to Pending for reprocessing. No stock changes are made — stock is only deducted when the order is (re-)confirmed.'
            : pendingTransition === 'CONFIRMED'
              ? 'This will deduct stock for every item in this order. If any item has insufficient stock, the whole change will be rejected.'
              : pendingTransition === 'CANCELLED'
                ? 'If stock was already deducted for this order, it will be restored.'
                : pendingTransition === 'RETURNED'
                  ? 'Stock for every item in this order will be restored.'
                  : undefined
        }
        destructive={pendingTransition ? isDestructiveTransition(pendingTransition) : false}
        isLoading={updateStatus.isPending}
        onConfirm={() => pendingTransition && handleStatusChange(pendingTransition)}
      />
    </div>
  );
}
