import { Schema, model } from 'mongoose';
import { pizzaSlug } from '../utils/slugify.js';

const pizzaSchema = new Schema(
  {
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
    description: {
      type: String,
      default: '',
      trim: true,
    },
    image: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Price cannot be negative'],
    },
    category: {
      type: String,
      enum: ['veg', 'non-veg'],
      default: 'veg',
    },
  },
  { timestamps: true }
);

pizzaSchema.pre('validate', function () {
  if (!this.slug && this.name) {
    this.slug = pizzaSlug(this.name);
  }
});

export default model('Pizza', pizzaSchema);
