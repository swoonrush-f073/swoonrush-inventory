import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { updateOrderSchema, type OrderDetailDto, type UpdateOrderInput } from '@swoonrush/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCustomers } from '@/api/customers';
import { useUpdateOrder } from '@/api/orders';
import { CustomerCombobox, NO_CUSTOMER } from './CustomerCombobox';
import { CustomerFormDialog } from '../customers/CustomerFormDialog';

interface EditOrderDialogProps {
  order: OrderDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditOrderDialog({ order, open, onOpenChange }: EditOrderDialogProps) {
  const [newCustomerName, setNewCustomerName] = React.useState('');
  const [customerFormOpen, setCustomerFormOpen] = React.useState(false);
  const { data: customers } = useCustomers({ limit: 100 });
  const updateOrder = useUpdateOrder(order.id);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<UpdateOrderInput>({
    resolver: zodResolver(updateOrderSchema),
    defaultValues: {
      customerId: order.customer?.id ?? null,
      discount: order.discount,
      shippingFee: order.shippingFee,
      tax: order.tax,
      stitchingCharge: order.stitchingCharge,
      notes: order.notes ?? '',
    },
  });

  // Re-seed on every open so a second edit (or a change made elsewhere in
  // the meantime) doesn't leave stale values in the form.
  React.useEffect(() => {
    if (open) {
      reset({
        customerId: order.customer?.id ?? null,
        discount: order.discount,
        shippingFee: order.shippingFee,
        tax: order.tax,
        stitchingCharge: order.stitchingCharge,
        notes: order.notes ?? '',
      });
    }
    // Deliberately only depends on `open`, not `order` — re-running this on
    // every order refetch (e.g. a background invalidation while the dialog
    // is open) would wipe whatever the admin had typed but not yet saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleCreateNewCustomer(name: string) {
    setNewCustomerName(name);
    setCustomerFormOpen(true);
  }

  async function onSubmit(values: UpdateOrderInput) {
    try {
      await updateOrder.mutateAsync(values);
      toast.success('Order updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update order');
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Order {order.orderNumber}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Controller
                control={control}
                name="customerId"
                render={({ field }) => (
                  <CustomerCombobox
                    customers={customers?.items ?? []}
                    value={field.value ?? NO_CUSTOMER}
                    onChange={(id) => field.onChange(id === NO_CUSTOMER ? null : id)}
                    onCreateNew={handleCreateNewCustomer}
                  />
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-discount">Discount</Label>
                <Input
                  id="edit-discount"
                  type="number"
                  min={0}
                  step="0.01"
                  {...register('discount', { valueAsNumber: true })}
                />
                {errors.discount && <p className="text-xs text-destructive">{errors.discount.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-shippingFee">Shipping</Label>
                <Input
                  id="edit-shippingFee"
                  type="number"
                  min={0}
                  step="0.01"
                  {...register('shippingFee', { valueAsNumber: true })}
                />
                {errors.shippingFee && <p className="text-xs text-destructive">{errors.shippingFee.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-tax">Tax</Label>
                <Input
                  id="edit-tax"
                  type="number"
                  min={0}
                  step="0.01"
                  {...register('tax', { valueAsNumber: true })}
                />
                {errors.tax && <p className="text-xs text-destructive">{errors.tax.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-stitchingCharge">Stitching charge</Label>
                <Input
                  id="edit-stitchingCharge"
                  type="number"
                  min={0}
                  step="0.01"
                  {...register('stitchingCharge', { valueAsNumber: true })}
                />
                {errors.stitchingCharge && (
                  <p className="text-xs text-destructive">{errors.stitchingCharge.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea id="edit-notes" {...register('notes')} />
            </div>

            <p className="text-xs text-muted-foreground">
              Products and quantities can't be changed after an order is created — cancel and
              re-create the order if an item was added in error.
            </p>

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CustomerFormDialog
        open={customerFormOpen}
        onOpenChange={setCustomerFormOpen}
        defaultName={newCustomerName}
        onCreated={(customer) => setValue('customerId', customer.id, { shouldValidate: true })}
      />
    </>
  );
}
