import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { updateOrderItemSchema, type OrderItemDto, type UpdateOrderItemInput } from '@swoonrush/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useProducts } from '@/api/products';
import { useUpdateOrderItem } from '@/api/orders';
import { ProductCombobox } from './ProductCombobox';

interface EditOrderItemDialogProps {
  orderId: string;
  item: OrderItemDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditOrderItemDialog({ orderId, item, open, onOpenChange }: EditOrderItemDialogProps) {
  const { data: products } = useProducts({ limit: 100, status: 'ACTIVE' });
  const updateItem = useUpdateOrderItem(orderId);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<UpdateOrderItemInput>({
    resolver: zodResolver(updateOrderItemSchema),
    defaultValues: {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleProductChange(productId: string, onFieldChange: (id: string) => void) {
    onFieldChange(productId);
    const product = products?.items.find((p) => p.id === productId);
    if (product) setValue('unitPrice', product.sellingPrice, { shouldValidate: true });
  }

  async function onSubmit(values: UpdateOrderItemInput) {
    try {
      await updateItem.mutateAsync({ itemId: item.id, ...values });
      toast.success('Item updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update item');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Controller
              control={control}
              name="productId"
              render={({ field }) => (
                <div className="flex">
                  <ProductCombobox
                    products={products?.items ?? []}
                    value={field.value}
                    onChange={(id) => handleProductChange(id, field.onChange)}
                  />
                </div>
              )}
            />
            {errors.productId && <p className="text-xs text-destructive">{errors.productId.message}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-quantity">Quantity</Label>
              <Input
                id="item-quantity"
                type="number"
                min={1}
                {...register('quantity', { valueAsNumber: true })}
              />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-unitPrice">Unit price</Label>
              <Input
                id="item-unitPrice"
                type="number"
                min={0}
                step="0.01"
                {...register('unitPrice', { valueAsNumber: true })}
              />
              {errors.unitPrice && <p className="text-xs text-destructive">{errors.unitPrice.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-discount">Discount</Label>
              <Input
                id="item-discount"
                type="number"
                min={0}
                step="0.01"
                {...register('discount', { valueAsNumber: true })}
              />
              {errors.discount && <p className="text-xs text-destructive">{errors.discount.message}</p>}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            If stock was already deducted for this order, changing the product or quantity here
            restores/deducts stock to match.
          </p>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
