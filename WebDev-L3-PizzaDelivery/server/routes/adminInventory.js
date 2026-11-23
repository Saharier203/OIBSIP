import express from 'express';
import mongoose from 'mongoose';
import InventoryItem, { INVENTORY_CATEGORIES, STOCK_UNITS } from '../Models/InventoryItem.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { inventorySlug } from '../utils/slugify.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameRegex(name) {
  return { $regex: `^${escapeRegex(name)}$`, $options: 'i' };
}

function normalizeName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateCategory(value) {
  return INVENTORY_CATEGORIES.includes(value);
}

function validateStockUnit(value) {
  return STOCK_UNITS.includes(value);
}

function parseNumber(value, field, { required = false } = {}) {
  if (value === undefined) {
    if (required) return { error: `${field} is required` };
    return { value: undefined };
  }
  if (value === null || value === '') {
    return { error: `${field} must be a number` };
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { error: `${field} must be a number` };
  }
  if (typeof value === 'string' && value.trim() === '') {
    return { error: `${field} must be a number` };
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return { error: `${field} must be a number` };
  }
  return { value: num };
}

function parseNonNegative(value, field, options) {
  const parsed = parseNumber(value, field, options);
  if (parsed.error) return parsed;
  if (parsed.value !== undefined && parsed.value < 0) {
    return { error: `${field} cannot be negative` };
  }
  return parsed;
}

router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    if (category && !validateCategory(category)) {
      return res.status(400).json({ error: `category must be one of: ${INVENTORY_CATEGORIES.join(', ')}` });
    }

    const filter = category ? { category } : {};
    const items = await InventoryItem.find(filter).sort({ category: 1, name: 1 });
    res.json(items);
  } catch (err) {
    console.error('Admin inventory list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body ?? {};
    const category = body.category;
    const name = normalizeName(body.name);
    const stockUnit = body.stockUnit;
    const image = body.image;

    if (!validateCategory(category)) {
      return res.status(400).json({ error: `category must be one of: ${INVENTORY_CATEGORIES.join(', ')}` });
    }
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!validateStockUnit(stockUnit)) {
      return res.status(400).json({ error: `stockUnit must be one of: ${STOCK_UNITS.join(', ')}` });
    }
    if (image !== undefined && typeof image !== 'string') {
      return res.status(400).json({ error: 'image must be a string' });
    }

    const price = parseNonNegative(body.price, 'price', { required: true });
    if (price.error) {
      return res.status(400).json({ error: price.error });
    }

    const stock = parseNonNegative(body.stock, 'stock', { required: true });
    if (stock.error) {
      return res.status(400).json({ error: stock.error });
    }

    const threshold = parseNonNegative(body.lowStockThreshold, 'lowStockThreshold');
    if (threshold.error) {
      return res.status(400).json({ error: threshold.error });
    }

    const slug = inventorySlug(category, name);
    const duplicate = await InventoryItem.findOne({
      $or: [{ slug }, { category, name: nameRegex(name) }],
    });
    if (duplicate) {
      return res.status(409).json({ error: 'An item with this name already exists in this category' });
    }

    const item = new InventoryItem({
      category,
      name,
      slug,
      price: price.value,
      stock: stock.value,
      stockUnit,
      image: image ?? '',
    });

    if (threshold.value !== undefined) {
      item.lowStockThreshold = threshold.value;
    }

    await item.save();
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Duplicate inventory item' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Admin inventory create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function updateItem(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid inventory item id' });
    }

    const item = await InventoryItem.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const body = req.body ?? {};
    const patch = {};

    if (body.category !== undefined) {
      if (!validateCategory(body.category)) {
        return res.status(400).json({ error: `category must be one of: ${INVENTORY_CATEGORIES.join(', ')}` });
      }
      patch.category = body.category;
    }

    if (body.name !== undefined) {
      const name = normalizeName(body.name);
      if (!name) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }
      patch.name = name;
    }

    if (body.stockUnit !== undefined) {
      if (!validateStockUnit(body.stockUnit)) {
        return res.status(400).json({ error: `stockUnit must be one of: ${STOCK_UNITS.join(', ')}` });
      }
      patch.stockUnit = body.stockUnit;
    }

    if (body.image !== undefined) {
      if (typeof body.image !== 'string') {
        return res.status(400).json({ error: 'image must be a string' });
      }
      patch.image = body.image;
    }

    if (body.price !== undefined) {
      const price = parseNonNegative(body.price, 'price', { required: true });
      if (price.error) {
        return res.status(400).json({ error: price.error });
      }
      patch.price = price.value;
    }

    if (body.stock !== undefined) {
      const stock = parseNonNegative(body.stock, 'stock', { required: true });
      if (stock.error) {
        return res.status(400).json({ error: stock.error });
      }
      patch.stock = stock.value;
    }

    if (body.lowStockThreshold !== undefined) {
      const threshold = parseNonNegative(body.lowStockThreshold, 'lowStockThreshold');
      if (threshold.error) {
        return res.status(400).json({ error: threshold.error });
      }
      patch.lowStockThreshold = threshold.value;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const nextCategory = patch.category ?? item.category;
    const nextName = patch.name ?? item.name;
    if (patch.category !== undefined || patch.name !== undefined) {
      const duplicate = await InventoryItem.findOne({
        _id: { $ne: item._id },
        category: nextCategory,
        name: nameRegex(nextName),
      });
      if (duplicate) {
        return res.status(409).json({ error: 'An item with this name already exists in this category' });
      }
    }

    item.set(patch);
    await item.save();
    res.json(item);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Duplicate inventory item' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Admin inventory update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.patch('/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid inventory item id' });
    }

    const delta = parseNumber(req.body?.delta, 'delta', { required: true });
    if (delta.error) {
      return res.status(400).json({ error: delta.error });
    }
    if (delta.value === 0) {
      return res.status(400).json({ error: 'delta cannot be zero' });
    }

    let item;
    if (delta.value < 0) {
      item = await InventoryItem.findOneAndUpdate(
        { _id: id, stock: { $gte: Math.abs(delta.value) } },
        { $inc: { stock: delta.value } },
        { returnDocument: 'after' }
      );
      if (!item) {
        const exists = await InventoryItem.exists({ _id: id });
        if (!exists) {
          return res.status(404).json({ error: 'Inventory item not found' });
        }
        return res.status(400).json({ error: 'Insufficient stock' });
      }
    } else {
      item = await InventoryItem.findByIdAndUpdate(
        id,
        { $inc: { stock: delta.value } },
        { returnDocument: 'after' }
      );
      if (!item) {
        return res.status(404).json({ error: 'Inventory item not found' });
      }
    }

    res.json(item);
  } catch (err) {
    console.error('Admin inventory stock update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', updateItem);
router.put('/:id', updateItem);

export default router;
