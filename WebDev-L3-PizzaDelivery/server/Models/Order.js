import { Schema, model } from 'mongoose';

export const ORDER_STATUSES = [
  'placed',
  'preparing',
  'out-for-delivery',
  'delivered',
  'cancelled',
];

export const ORDER_ITEM_TYPES = ['pizza', 'ingredient'];

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

export const REFUND_STATUSES = ['none', 'processing', 'pending', 'processed', 'failed'];

export const MAX_ORDER_ITEMS = 50;
export const MAX_ITEM_QUANTITY = 100;
export const MAX_MONEY = 10_000_000;

const finiteNumber = {
  validator: (value) => Number.isFinite(value),
  message: (props) => `${props.path} must be a finite number`,
};

const orderItemSchema = new Schema(
  {
    itemType: {
      type: String,
      enum: ORDER_ITEM_TYPES,
      required: true,
    },
    itemId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      default: '',
      lowercase: true,
      trim: true,
    },
    category: {
      type: String,
      default: '',
      trim: true,
    },
    stockUnit: {
      type: String,
      default: '',
      trim: true,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, 'Unit price cannot be negative'],
      max: [MAX_MONEY, `Unit price cannot exceed ${MAX_MONEY}`],
      validate: finiteNumber,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      max: [MAX_ITEM_QUANTITY, `Quantity cannot exceed ${MAX_ITEM_QUANTITY}`],
      validate: [
        finiteNumber,
        {
          validator: (value) => Number.isSafeInteger(value),
          message: 'Quantity must be a safe integer',
        },
      ],
    },
    lineTotal: {
      type: Number,
      required: true,
      min: [0, 'Line total cannot be negative'],
      max: [MAX_MONEY, `Line total cannot exceed ${MAX_MONEY}`],
      validate: finiteNumber,
    },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [
        {
          validator: (value) => Array.isArray(value) && value.length > 0,
          message: 'Order must contain at least one item',
        },
        {
          validator: (value) => !Array.isArray(value) || value.length <= MAX_ORDER_ITEMS,
          message: `Order cannot contain more than ${MAX_ORDER_ITEMS} items`,
        },
      ],
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'Subtotal cannot be negative'],
      max: [MAX_MONEY, `Subtotal cannot exceed ${MAX_MONEY}`],
      validate: finiteNumber,
    },
    total: {
      type: Number,
      required: true,
      min: [0, 'Total cannot be negative'],
      max: [MAX_MONEY, `Total cannot exceed ${MAX_MONEY}`],
      validate: finiteNumber,
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'placed',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'pending',
      index: true,
    },
    razorpayOrderId: {
      type: String,
      default: null,
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      trim: true,
    },
    paymentAmount: {
      type: Number,
      default: null,
      min: [0, 'Payment amount cannot be negative'],
      max: [MAX_MONEY * 100, `Payment amount cannot exceed ${MAX_MONEY * 100}`],
      validate: {
        validator: (value) => value === null || value === undefined || Number.isSafeInteger(value),
        message: 'Payment amount must be a safe integer in paise',
      },
    },
    paymentCurrency: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
      validate: {
        validator: (value) => value === null || value === undefined || /^[A-Z]{3}$/.test(value),
        message: 'Payment currency must be a 3-letter code',
      },
    },
    paidAt: {
      type: Date,
      default: null,
    },
    refundStatus: {
      type: String,
      enum: REFUND_STATUSES,
      default: 'none',
    },
    razorpayRefundId: {
      type: String,
      default: null,
      trim: true,
    },
    refundAmount: {
      type: Number,
      default: null,
      min: [0, 'Refund amount cannot be negative'],
      max: [MAX_MONEY * 100, `Refund amount cannot exceed ${MAX_MONEY * 100}`],
      validate: {
        validator: (value) => value === null || value === undefined || Number.isSafeInteger(value),
        message: 'Refund amount must be a safe integer in paise',
      },
    },
    refundedAt: {
      type: Date,
      default: null,
    },
    refundInitiatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default model('Order', orderSchema);
