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

describe('stock-in', () => {
  it('increases stock and records a STOCK_IN movement', async () => {
    const { status, json } = await api.post('/api/inventory/stock-in', {
      token,
      body: { productId, quantity: 20, reason: 'New stock' },
    });

    expect(status).toBe(200);
    expect(json.data.stockQuantity).toBe(30);

    const movements = await api.get(`/api/inventory/movements?productId=${productId}&type=STOCK_IN`, { token });
    expect(movements.json.data.items).toHaveLength(1);
    expect(movements.json.data.items[0].quantity).toBe(20);
  });
});

describe('stock adjustment', () => {
  it('applies a negative adjustment and records it', async () => {
    const { status, json } = await api.post('/api/inventory/adjust', {
      token,
      body: { productId, quantity: -3, reason: 'Damaged' },
    });

    expect(status).toBe(200);
    expect(json.data.stockQuantity).toBe(7);
  });

  it('rejects an adjustment that would push stock negative, and does not change stock', async () => {
    const { status, json } = await api.post('/api/inventory/adjust', {
      token,
      body: { productId, quantity: -1000, reason: 'Too much' },
    });

    expect(status).toBe(422);
    expect(json.error.code).toBe('VALIDATION_ERROR');

    const product = await api.get(`/api/products/${productId}`, { token });
    expect(product.json.data.stockQuantity).toBe(10); // unchanged
  });

  it('requires a reason for adjustments', async () => {
    const { status } = await api.post('/api/inventory/adjust', {
      token,
      body: { productId, quantity: -1, reason: '' },
    });
    expect(status).toBe(422);
  });
});

describe('low-stock listing', () => {
  it('flags a product as low stock once quantity drops to the limit', async () => {
    await api.post('/api/inventory/adjust', {
      token,
      body: { productId, quantity: -6, reason: 'Sold at market stall' },
    });

    const { json } = await api.get('/api/inventory/low-stock', { token });
    expect(json.data.items.some((p: { id: string }) => p.id === productId)).toBe(true);
  });
});

describe('total stock in', () => {
  it('sums OPENING_STOCK and STOCK_IN, ignoring adjustments, for a standalone product', async () => {
    await api.post('/api/inventory/stock-in', { token, body: { productId, quantity: 20, reason: 'Restock' } });
    await api.post('/api/inventory/adjust', { token, body: { productId, quantity: -3, reason: 'Damaged' } });

    const list = await api.get('/api/inventory', { token });
    const row = list.json.data.items.find((p: { id: string }) => p.id === productId);
    expect(row.totalStockIn).toBe(30); // 10 opening + 20 stock-in, -3 adjustment excluded

    const catalog = await api.get('/api/inventory/catalog', { token });
    const catalogRow = catalog.json.data.items.find((p: { id: string }) => p.id === productId);
    expect(catalogRow.totalStockIn).toBe(30);
  });

  it('sums total stock in across every variant for a group row', async () => {
    const category = await api.post('/api/categories', { token, body: { name: 'Pants' } });
    const group = await api.post('/api/product-groups', {
      token,
      body: {
        categoryId: category.json.data.id,
        name: 'Cargo Pants',
        purchasePrice: 500,
        sellingPrice: 1299,
        variants: [
          { sku: 'PT-BLK-32', size: '32', color: 'Black', stockQuantity: 10 },
          { sku: 'PT-KHK-34', size: '34', color: 'Khaki', stockQuantity: 5 },
        ],
      },
    });
    const [variantA] = group.json.data.variants;
    await api.post('/api/inventory/stock-in', {
      token,
      body: { productId: variantA.id, quantity: 8, reason: 'Restock' },
    });

    const catalog = await api.get('/api/inventory/catalog', { token });
    const groupRow = catalog.json.data.items.find((p: { id: string }) => p.id === group.json.data.id);
    expect(groupRow.totalStockIn).toBe(23); // (10 + 5 opening) + 8 stock-in
  });
});
