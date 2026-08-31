import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { OrderStatus } from '@swoonrush/shared';
import { renderWithProviders } from '@/test/testUtils';
import { OrderDetailPage } from './OrderDetailPage';

const updateStatus = vi.fn().mockResolvedValue({});
const updateOrder = vi.fn().mockResolvedValue({});
const updateOrderItem = vi.fn().mockResolvedValue({});

const order = {
  id: 'order-1',
  orderNumber: 'ORD-1001',
  orderDate: '2026-01-01T00:00:00.000Z',
  customerId: null,
  customerName: null,
  itemCount: 1,
  total: 799,
  paymentStatus: 'PENDING' as const,
  orderStatus: 'PENDING' as const,
  subtotal: 799,
  discount: 0,
  shippingFee: 0,
  tax: 0,
  stitchingCharge: 0,
  notes: null,
  customer: null,
  items: [
    {
      id: 'item-1',
      productId: '11111111-1111-1111-1111-111111111111',
      productName: 'Oversized T-Shirt',
      sku: 'TS-BLK-M',
      quantity: 1,
      unitPrice: 799,
      discount: 0,
      total: 799,
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let currentOrder: Omit<typeof order, 'orderStatus'> & { orderStatus: OrderStatus } = order;

vi.mock('@/api/orders', () => ({
  useOrder: () => ({ data: currentOrder, isPending: false, isError: false, error: null, refetch: vi.fn() }),
  useUpdateOrderStatus: () => ({ mutateAsync: updateStatus, isPending: false }),
  useUpdatePaymentStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateOrder: () => ({ mutateAsync: updateOrder, isPending: false }),
  useUpdateOrderItem: () => ({ mutateAsync: updateOrderItem, isPending: false }),
}));

vi.mock('@/api/customers', () => ({
  useCustomers: () => ({ data: { items: [] }, isPending: false }),
  useCreateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCustomer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/api/products', () => ({
  useProducts: () => ({
    data: {
      items: [
        { id: '11111111-1111-1111-1111-111111111111', sku: 'TS-BLK-M', name: 'Oversized T-Shirt', sellingPrice: 799 },
        {
          id: '22222222-2222-2222-2222-222222222222',
          sku: 'SW-OT-05-S',
          name: 'Khun Thee Oversized T-Shirt',
          sellingPrice: 899,
        },
      ],
    },
    isPending: false,
  }),
}));

describe('OrderDetailPage', () => {
  beforeEach(() => {
    currentOrder = order;
  });

  it('shows only the transitions allowed from PENDING', () => {
    renderWithProviders(<OrderDetailPage />, { route: '/orders/order-1', path: '/orders/:id' });

    expect(screen.getByRole('button', { name: /mark as confirmed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark as cancelled/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark as delivered/i })).not.toBeInTheDocument();
  });

  it('confirms the transition through the confirmation dialog before calling the API', async () => {
    renderWithProviders(<OrderDetailPage />, { route: '/orders/order-1', path: '/orders/:id' });

    fireEvent.click(screen.getByRole('button', { name: /mark as confirmed/i }));
    expect(screen.getByText(/mark order as confirmed\?/i)).toBeInTheDocument();
    expect(updateStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith('CONFIRMED'));
  });

  it('opens the edit dialog and saves the edited fields', async () => {
    renderWithProviders(<OrderDetailPage />, { route: '/orders/order-1', path: '/orders/:id' });

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByRole('heading', { name: /edit order ord-1001/i })).toBeInTheDocument();

    expect(screen.getByLabelText(/order date/i)).toHaveValue('2026-01-01');

    fireEvent.change(screen.getByLabelText(/^discount$/i), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateOrder).toHaveBeenCalledWith(
        expect.objectContaining({ discount: 50, shippingFee: 0, tax: 0, stitchingCharge: 0, orderDate: '2026-01-01' }),
      ),
    );
  });

  it('lets the order date be corrected', async () => {
    renderWithProviders(<OrderDetailPage />, { route: '/orders/order-1', path: '/orders/:id' });

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText(/order date/i), { target: { value: '2025-12-25' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateOrder).toHaveBeenCalledWith(expect.objectContaining({ orderDate: '2025-12-25' })),
    );
  });

  it('lets a cancelled order be reopened back to Pending', async () => {
    currentOrder = { ...order, orderStatus: 'CANCELLED' };
    renderWithProviders(<OrderDetailPage />, { route: '/orders/order-1', path: '/orders/:id' });

    expect(screen.queryByRole('button', { name: /mark as/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reopen order/i }));
    expect(screen.getByText(/reopen this order\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith('PENDING'));
  });

  it('lets a line item be swapped to a different product', async () => {
    renderWithProviders(<OrderDetailPage />, { route: '/orders/order-1', path: '/orders/:id' });

    fireEvent.click(screen.getByRole('button', { name: /edit oversized t-shirt/i }));
    expect(screen.getByRole('heading', { name: /edit item/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText(/khun thee oversized t-shirt/i));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateOrderItem).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          productId: '22222222-2222-2222-2222-222222222222',
          unitPrice: 899,
        }),
      ),
    );
  });
});
