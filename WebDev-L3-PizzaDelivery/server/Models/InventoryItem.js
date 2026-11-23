import { Schema, model } from 'mongoose';
import { inventorySlug } from '../utils/slugify.js';

export const INVENTORY_CATEGORIES = ['base', 'sauce', 'cheese', 'vegetable'];

export const STOCK_UNITS = ['piece', 'gram', 'ml'];

export const DEFAULT_STOCK_UNIT = {
  base: 'piece',
  sauce: 'ml',
  cheese: 'gram',
  vegetable: 'piece',
};

const inventoryItemSchema = new Schema(
  {
    category: {
      type: String,
      enum: INVENTORY_CATEGORIES,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Price cannot be negative'],
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Stock cannot be negative'],
    },
    stockUnit: {
      type: String,
      enum: {
        values: STOCK_UNITS,
        message: 'stockUnit must be one of: piece, gram, ml',
      },
      required: true,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: [0, 'Threshold cannot be negative'],
    },
    image: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

inventoryItemSchema.pre('validate', function () {
  if (!this.slug && this.category && this.name) {
    this.slug = inventorySlug(this.category, this.name);
  }
  if (!this.stockUnit) {
    this.stockUnit = DEFAULT_STOCK_UNIT[this.category] || 'piece';
  }
});

inventoryItemSchema.index({ category: 1, name: 1 }, { unique: true });

export default model('InventoryItem', inventoryItemSchema);
