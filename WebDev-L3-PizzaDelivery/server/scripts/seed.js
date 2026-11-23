import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import InventoryItem from '../Models/InventoryItem.js';
import Pizza from '../Models/Pizza.js';
import { inventorySlug, pizzaSlug } from '../utils/slugify.js';

const inventory = [
  { category: 'base', name: 'Classic Hand Tossed', price: 79, stock: 100, stockUnit: 'piece', lowStockThreshold: 15 },
  { category: 'base', name: 'Thin Crust', price: 89, stock: 100, stockUnit: 'piece', lowStockThreshold: 15 },
  { category: 'base', name: 'Cheese Burst', price: 129, stock: 60, stockUnit: 'piece', lowStockThreshold: 15 },
  { category: 'base', name: 'Whole Wheat', price: 99, stock: 80, stockUnit: 'piece', lowStockThreshold: 15 },
  { category: 'base', name: 'Garlic Bread Base', price: 109, stock: 40, stockUnit: 'piece', lowStockThreshold: 10 },

  { category: 'sauce', name: 'Classic Tomato', price: 29, stock: 120, stockUnit: 'ml', lowStockThreshold: 20 },
  { category: 'sauce', name: 'Barbeque', price: 39, stock: 90, stockUnit: 'ml', lowStockThreshold: 20 },
  { category: 'sauce', name: 'Pesto', price: 49, stock: 50, stockUnit: 'ml', lowStockThreshold: 15 },
  { category: 'sauce', name: 'Peri-Peri', price: 39, stock: 80, stockUnit: 'ml', lowStockThreshold: 20 },
  { category: 'sauce', name: 'White Garlic', price: 49, stock: 60, stockUnit: 'ml', lowStockThreshold: 15 },

  { category: 'cheese', name: 'Mozzarella', price: 59, stock: 150, stockUnit: 'gram', lowStockThreshold: 25 },
  { category: 'cheese', name: 'Cheddar', price: 69, stock: 80, stockUnit: 'gram', lowStockThreshold: 20 },
  { category: 'cheese', name: 'Parmesan', price: 79, stock: 40, stockUnit: 'gram', lowStockThreshold: 15 },
  { category: 'cheese', name: 'Mixed Cheese', price: 89, stock: 70, stockUnit: 'gram', lowStockThreshold: 20 },

  { category: 'vegetable', name: 'Onion', price: 20, stock: 200, stockUnit: 'piece', lowStockThreshold: 30 },
  { category: 'vegetable', name: 'Capsicum', price: 20, stock: 180, stockUnit: 'piece', lowStockThreshold: 30 },
  { category: 'vegetable', name: 'Tomato', price: 20, stock: 160, stockUnit: 'piece', lowStockThreshold: 30 },
  { category: 'vegetable', name: 'Black Olives', price: 30, stock: 90, stockUnit: 'piece', lowStockThreshold: 20 },
  { category: 'vegetable', name: 'Mushroom', price: 30, stock: 70, stockUnit: 'piece', lowStockThreshold: 20 },
  { category: 'vegetable', name: 'Sweet Corn', price: 25, stock: 110, stockUnit: 'piece', lowStockThreshold: 25 },
  { category: 'vegetable', name: 'Jalapeno', price: 30, stock: 60, stockUnit: 'piece', lowStockThreshold: 15 },
  { category: 'vegetable', name: 'Pineapple', price: 25, stock: 8, stockUnit: 'piece', lowStockThreshold: 15 },
];

const pizzas = [
  {
    name: 'Margherita',
    description: 'Classic delight with tomato sauce, mozzarella and basil.',
    price: 199,
    category: 'veg',
  },
  {
    name: 'Farmhouse',
    description: 'Onion, capsicum, tomato and mushroom on a cheesy base.',
    price: 299,
    category: 'veg',
  },
  {
    name: 'Peppy Paneer',
    description: 'Paneer, capsicum and red paprika with a spicy kick.',
    price: 319,
    category: 'veg',
  },
  {
    name: 'Veggie Supreme',
    description: 'Loaded with onion, capsicum, corn, olives and mushroom.',
    price: 349,
    category: 'veg',
  },
  {
    name: 'BBQ Chicken',
    description: 'Grilled chicken, onion and smoky barbeque sauce.',
    price: 379,
    category: 'non-veg',
  },
];

function assertUniqueSlugs(items, toSlug, label) {
  const seen = new Set();
  for (const item of items) {
    const slug = toSlug(item);
    if (seen.has(slug)) {
      throw new Error(`Duplicate ${label} slug in seed data: ${slug}`);
    }
    seen.add(slug);
  }
}

async function seedInventory() {
  const result = { inserted: 0, backfilled: 0, unchanged: 0 };

  for (const item of inventory) {
    const slug = inventorySlug(item.category, item.name);
    const existing = await InventoryItem.findOne({
      $or: [{ slug }, { category: item.category, name: item.name }],
    });

    if (!existing) {
      await InventoryItem.create({ ...item, slug, image: '' });
      result.inserted += 1;
      continue;
    }

    let changed = false;
    if (!existing.slug) {
      existing.slug = slug;
      changed = true;
    }
    if (!existing.stockUnit) {
      existing.stockUnit = item.stockUnit;
      changed = true;
    }

    if (changed) {
      await existing.save();
      result.backfilled += 1;
    } else {
      result.unchanged += 1;
    }
  }

  return result;
}

async function seedPizzas() {
  const result = { inserted: 0, backfilled: 0, unchanged: 0 };

  for (const pizza of pizzas) {
    const slug = pizzaSlug(pizza.name);
    const existing = await Pizza.findOne({ $or: [{ slug }, { name: pizza.name }] });

    if (!existing) {
      await Pizza.create({ ...pizza, slug, image: '' });
      result.inserted += 1;
      continue;
    }

    if (!existing.slug) {
      existing.slug = slug;
      await existing.save();
      result.backfilled += 1;
    } else {
      result.unchanged += 1;
    }
  }

  return result;
}

async function seed() {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    await Promise.all([InventoryItem.init(), Pizza.init()]);

    assertUniqueSlugs(inventory, (item) => inventorySlug(item.category, item.name), 'inventory');
    assertUniqueSlugs(pizzas, (pizza) => pizzaSlug(pizza.name), 'pizza');

    const inventoryResult = await seedInventory();
    const pizzaResult = await seedPizzas();

    const [inventoryTotal, pizzaTotal, items] = await Promise.all([
      InventoryItem.countDocuments(),
      Pizza.countDocuments(),
      InventoryItem.find().lean(),
    ]);

    const byCategory = items.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    console.log('Seed complete (idempotent; no records deleted).');
    console.log('Inventory:', inventoryResult, 'total:', inventoryTotal, 'by category:', byCategory);
    console.log('Pizzas:', pizzaResult, 'total:', pizzaTotal);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seed();
