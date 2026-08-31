import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './helpers/apiClient.js';
import { createAuthenticatedUser } from './helpers/testAuth.js';

let token: string;
let productId: string;

beforeEach(async () => {
  ({ token } = await createAuthenticatedUser('OWNER'));
  const category = await api.post('/api/categories', { token, body: { name: 'T-Shirts' } });
  const product = await api.post('/api/products', {
    token,
    body: {
      categoryId: category.json.data.id,
      sku: 'TS-BLK-M',
      name: 'Oversized T-Shirt',
      purchasePrice: 300,
      sellingPrice: 799,
      stockQuantity: 10,
      lowStockLimit: 5,
    },
  });
  productId = product.json.data.id;
});

describe('order creation', () => {
  it('computes totals on the backend regardless of what the client sends', async () => {
    const { status, json } = await api.post('/api/orders', {
      token,
      body: {
        items: [{ productId, quantity: 3 }],
        shippingFee: 50,
        // no unitPrice sent -> must default to the product's current selling price
      },
    });

    expect(status).toBe(201);
    expect(json.data.items[0].unitPrice).toBe(799);
    expect(json.data.subtotal).toBe(2397); // 3 * 799
    expect(json.data.total).toBe(2447); // subtotal + shipping
    expect(json.data.stitchingCharge).toBe(0);
    expect(json.data.orderStatus).toBe('PENDING');
  });

  it('adds an optional stitching charge to the total and reports it separately', async () => {
    const { status, json } = await api.post('/api/orders', {
      token,
      body: {
        items: [{ productId, quantity: 2 }],
        stitchingCharge: 150,
      },
    });

    expect(status).toBe(201);
    expect(json.data.stitchingCharge).toBe(150);
    expect(json.data.total).toBe(2 * 799 + 150);
  });

  it('allows a stitching-only order with no products, priced at the stitching charge', async () => {
    const { status, json } = await api.post('/api/orders', {
      token,
      body: { items: [], stitchingCharge: 300 },
    });

    expect(status).toBe(201);
    expect(json.data.items).toHaveLength(0);
    expect(json.data.subtotal).toBe(0);
    expect(json.data.total).toBe(300);
  });

  it('rejects an order with no products and no stitching charge', async () => {
    const { status, json } = await api.post('/api/orders', { token, body: { items: [] } });

    expect(status).toBe(422);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('does not touch stock until the order is confirmed', async () => {
    await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 3 }] } });
    const product = await api.get(`/api/products/${productId}`, { token });
    expect(product.json.data.stockQuantity).toBe(10);
  });
});

describe('order editing', () => {
  it('lets the order date be corrected', async () => {
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 1 }] } });

    const { status, json } = await api.patch(`/api/orders/${order.json.data.id}`, {
      token,
      body: { orderDate: '2025-12-25' },
    });

    expect(status).toBe(200);
    expect(json.data.orderDate.slice(0, 10)).toBe('2025-12-25');
  });

  it('rejects a malformed order date', async () => {
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 1 }] } });

    const { status } = await api.patch(`/api/orders/${order.json.data.id}`, {
      token,
      body: { orderDate: '25-12-2025' },
    });

    expect(status).toBe(422);
  });
});

describe('order confirmation', () => {
  it('deducts stock and records a SALE movement referencing the order', async () => {
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 3 }] } });
    const orderId = order.json.data.id;

    const { status, json } = await api.patch(`/api/orders/${orderId}/status`, {
      token,
      body: { status: 'CONFIRMED' },
    });

    expect(status).toBe(200);
    expect(json.data.orderStatus).toBe('CONFIRMED');

    const product = await api.get(`/api/products/${productId}`, { token });
    expect(product.json.data.stockQuantity).toBe(7);

    const movements = await api.get(`/api/inventory/movements?productId=${productId}&type=SALE`, { token });
    expect(movements.json.data.items).toHaveLength(1);
    expect(movements.json.data.items[0].quantity).toBe(-3);
    expect(movements.json.data.items[0].referenceId).toBe(orderId);
  });

  it('rejects confirmation when stock is insufficient and leaves stock untouched', async () => {
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 999 }] } });

    const { status, json } = await api.patch(`/api/orders/${order.json.data.id}/status`, {
      token,
      body: { status: 'CONFIRMED' },
    });

    expect(status).toBe(422);
    expect(json.error.message).toMatch(/insufficient stock/i);

    const product = await api.get(`/api/products/${productId}`, { token });
    expect(product.json.data.stockQuantity).toBe(10);

    const orderAfter = await api.get(`/api/orders/${order.json.data.id}`, { token });
    expect(orderAfter.json.data.orderStatus).toBe('PENDING');
  });

  it('rejects an illegal status jump', async () => {
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 1 }] } });

    const { status } = await api.patch(`/api/orders/${order.json.data.id}/status`, {
      token,
      body: { status: 'DELIVERED' },
    });

    expect(status).toBe(422);
  });
});

describe('order cancellation', () => {
  it('restores stock and records a CANCELLED_ORDER movement when cancelling a confirmed order', async () => {
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 3 }] } });
    await api.patch(`/api/orders/${order.json.data.id}/status`, { token, body: { status: 'CONFIRMED' } });

    const { status, json } = await api.patch(`/api/orders/${order.json.data.id}/status`, {
      token,
      body: { status: 'CANCELLED' },
    });

    expect(status).toBe(200);
    expect(json.data.orderStatus).toBe('CANCELLED');

    const product = await api.get(`/api/products/${productId}`, { token });
    expect(product.json.data.stockQuantity).toBe(10); // fully restored
  });

  it('does not restore stock when cancelling a still-PENDING order (nothing was deducted)', async () => {
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 3 }] } });

    await api.patch(`/api/orders/${order.json.data.id}/status`, { token, body: { status: 'CANCELLED' } });

    const movements = await api.get(`/api/inventory/movements?productId=${productId}`, { token });
    expect(movements.json.data.items.filter((m: { type: string }) => m.type === 'CANCELLED_ORDER')).toHaveLength(0);
  });

  it('never double-restores stock on a repeated cancel call', async () => {
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 3 }] } });
    await api.patch(`/api/orders/${order.json.data.id}/status`, { token, body: { status: 'CONFIRMED' } });
    await api.patch(`/api/orders/${order.json.data.id}/status`, { token, body: { status: 'CANCELLED' } });
    await api.patch(`/api/orders/${order.json.data.id}/status`, { token, body: { status: 'CANCELLED' } });

    const product = await api.get(`/api/products/${productId}`, { token });
    expect(product.json.data.stockQuantity).toBe(10); // not 13
  });

  it('allows reopening a cancelled order back to Pending, with no stock side effects', async () => {
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 3 }] } });
    await api.patch(`/api/orders/${order.json.data.id}/status`, { token, body: { status: 'CONFIRMED' } });
    await api.patch(`/api/orders/${order.json.data.id}/status`, { token, body: { status: 'CANCELLED' } });

    const { status, json } = await api.patch(`/api/orders/${order.json.data.id}/status`, {
      token,
      body: { status: 'PENDING' },
    });

    expect(status).toBe(200);
    expect(json.data.orderStatus).toBe('PENDING');

    const product = await api.get(`/api/products/${productId}`, { token });
    expect(product.json.data.stockQuantity).toBe(10); // still fully restored, nothing re-deducted
  });

  it('rejects reopening an order that was never cancelled', async () => {
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 3 }] } });
    await api.patch(`/api/orders/${order.json.data.id}/status`, { token, body: { status: 'CONFIRMED' } });

    const { status } = await api.patch(`/api/orders/${order.json.data.id}/status`, {
      token,
      body: { status: 'PENDING' },
    });

    expect(status).toBe(422);
  });
});

describe('order item editing', () => {
  async function createSecondProduct(stockQuantity = 5) {
    const category = await api.post('/api/categories', { token, body: { name: 'Kurtas' } });
    const product = await api.post('/api/products', {
      token,
      body: {
        categoryId: category.json.data.id,
        sku: 'SW-OT-05-S',
        name: 'Khun Thee Oversized T-Shirt',
        purchasePrice: 350,
        sellingPrice: 899,
        stockQuantity,
        lowStockLimit: 5,
      },
    });
    return product.json.data.id as string;
  }

  it('swaps a PENDING order item to a different product with no stock side effects', async () => {
    const secondProductId = await createSecondProduct();
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 2 }] } });
    const itemId = order.json.data.items[0].id;

    const { status, json } = await api.patch(`/api/orders/${order.json.data.id}/items/${itemId}`, {
      token,
      body: { productId: secondProductId, quantity: 2 },
    });

    expect(status).toBe(200);
    expect(json.data.items[0].productId).toBe(secondProductId);
    expect(json.data.items[0].unitPrice).toBe(899);
    expect(json.data.subtotal).toBe(1798); // 2 * 899
    expect(json.data.total).toBe(1798);

    const original = await api.get(`/api/products/${productId}`, { token });
    const swapped = await api.get(`/api/products/${secondProductId}`, { token });
    expect(original.json.data.stockQuantity).toBe(10); // untouched, nothing was deducted yet
    expect(swapped.json.data.stockQuantity).toBe(5); // untouched
  });

  it('reconciles stock when swapping a product on a CONFIRMED order', async () => {
    const secondProductId = await createSecondProduct();
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 3 }] } });
    const itemId = order.json.data.items[0].id;
    await api.patch(`/api/orders/${order.json.data.id}/status`, { token, body: { status: 'CONFIRMED' } });

    const { status } = await api.patch(`/api/orders/${order.json.data.id}/items/${itemId}`, {
      token,
      body: { productId: secondProductId, quantity: 3 },
    });

    expect(status).toBe(200);

    const original = await api.get(`/api/products/${productId}`, { token });
    const swapped = await api.get(`/api/products/${secondProductId}`, { token });
    expect(original.json.data.stockQuantity).toBe(10); // restored (3 deducted, 3 restored)
    expect(swapped.json.data.stockQuantity).toBe(2); // 5 - 3 deducted
  });

  it('rejects a product swap on a CONFIRMED order when the new product lacks stock', async () => {
    const secondProductId = await createSecondProduct(1);
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 3 }] } });
    const itemId = order.json.data.items[0].id;
    await api.patch(`/api/orders/${order.json.data.id}/status`, { token, body: { status: 'CONFIRMED' } });

    const { status } = await api.patch(`/api/orders/${order.json.data.id}/items/${itemId}`, {
      token,
      body: { productId: secondProductId, quantity: 3 },
    });

    expect(status).toBe(422);

    const original = await api.get(`/api/products/${productId}`, { token });
    const swapped = await api.get(`/api/products/${secondProductId}`, { token });
    expect(original.json.data.stockQuantity).toBe(7); // unchanged — the whole edit was rejected
    expect(swapped.json.data.stockQuantity).toBe(1); // unchanged
  });

  it('adjusts stock by the delta when only quantity changes on a CONFIRMED order', async () => {
    const order = await api.post('/api/orders', { token, body: { items: [{ productId, quantity: 3 }] } });
    const itemId = order.json.data.items[0].id;
    await api.patch(`/api/orders/${order.json.data.id}/status`, { token, body: { status: 'CONFIRMED' } });

    const { status } = await api.patch(`/api/orders/${order.json.data.id}/items/${itemId}`, {
      token,
      body: { productId, quantity: 5 },
    });

    expect(status).toBe(200);

    const product = await api.get(`/api/products/${productId}`, { token });
    expect(product.json.data.stockQuantity).toBe(5); // 10 - 5, not 10 - 3 - 5
  });
});
