import express from 'express';
import InventoryItem from '../Models/InventoryItem.js';
import Pizza from '../Models/Pizza.js';

const router = express.Router();

const CATEGORY_KEYS = {
  base: 'bases',
  sauce: 'sauces',
  cheese: 'cheeses',
  vegetable: 'vegetables',
};

// --- GET /api/catalog ---
router.get('/', async (req, res) => {
  try {
    const [items, pizzas] = await Promise.all([
      InventoryItem.find().sort({ category: 1, name: 1 }),
      Pizza.find().sort({ name: 1 }),
    ]);

    const catalog = { bases: [], sauces: [], cheeses: [], vegetables: [], pizzas };
    for (const item of items) {
      const key = CATEGORY_KEYS[item.category];
      if (key) catalog[key].push(item);
    }

    res.json(catalog);
  } catch (err) {
    console.error('Catalog error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
