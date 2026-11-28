import express from 'express';
import mongoose from 'mongoose';
import Order, {
  ORDER_ITEM_TYPES,
  MAX_ORDER_ITEMS,
  MAX_ITEM_QUANTITY,
  MAX_MONEY,
} from '../Models/Order.js';
import Pizza from '../Models/Pizza.js';
import InventoryItem from '../Models/InventoryItem.js';
import { requireAuth, requireCustomer } from '../middleware/auth.js';
import { razorpayService, PaymentConfigError } from '../Services/razorpayService.js';

const router = express.Router();

router.use(requireAuth, requireCustomer);

const PAYMENT_CURRENCY = 'INR';
const MIN_PAYMENT_AMOUNT = 100;

class OrderError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'OrderError';
    this.status = status;
  }
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function parseQuantity(value) {
  if (value === undefined || value === null || value === '') {
    return { error: 'quantity is required' };
  }
  if (typeof value === 'boolean' || (typeof value !== 'number' && typeof value !== 'string')) {
    return { error: `quantity must be a safe integer between 1 and ${MAX_ITEM_QUANTITY}` };
  }
  if (typeof value === 'string' && value.trim() === '') {
    return { error: `quantity must be a safe integer between 1 and ${MAX_ITEM_QUANTITY}` };
  }

  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
    return { error: `quantity must be a safe integer between 1 and ${MAX_ITEM_QUANTITY}` };
  }
  return { value: quantity };
}

function parseItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: 'items must be a non-empty array' };
  }
  if (rawItems.length > MAX_ORDER_ITEMS) {
    return { error: `An order can contain at most ${MAX_ORDER_ITEMS} items` };
  }

  const items = [];
  const seen = new Set();

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { error: 'Each item must be an object with itemType, itemId and quantity' };
    }

    const { itemType, itemId } = raw;
    if (!ORDER_ITEM_TYPES.includes(itemType)) {
      return { error: `itemType must be one of: ${ORDER_ITEM_TYPES.join(', ')}` };
    }
    if (typeof itemId !== 'string' || !mongoose.isValidObjectId(itemId)) {
      return { error: 'itemId must be a valid id' };
    }

    const quantity = parseQuantity(raw.quantity);
    if (quantity.error) {
      return { error: quantity.error };
    }

    const key = `${itemType}:${itemId}`;
    if (seen.has(key)) {
      return { error: 'Duplicate items are not allowed; combine the quantities instead' };
    }
    seen.add(key);

    items.push({ itemType, itemId, quantity: quantity.value });
  }

  return { items };
}

function assertValidMoney(value) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_MONEY) {
    throw new OrderError(400, 'One or more order amounts are invalid');
  }
}

function assertValidPrice(value) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_MONEY) {
    throw new OrderError(400, 'One or more items have an invalid price');
  }
}

function paymentAmountForOrder(order) {
  const amount = Math.round(order.total * 100);
  if (!Number.isSafeInteger(amount) || amount < MIN_PAYMENT_AMOUNT) {
    return null;
  }
  return amount;
}

function payablePaymentStatusFilter() {
  return {
    $or: [
      { paymentStatus: { $in: ['pending', 'failed'] } },
      { paymentStatus: { $exists: false } },
    ],
  };
}

function checkoutInfo(order, keyId, user) {
  return {
    appOrderId: order._id,
    key: keyId,
    amount: order.paymentAmount,
    currency: order.paymentCurrency,
    order_id: order.razorpayOrderId,
    name: process.env.FROM_NAME || 'Pizza Delivery',
    description: `Pizza order ${order._id}`,
    prefill: {
      name: user.name,
      email: user.email,
    },
    paymentStatus: order.paymentStatus || 'pending',
  };
}

router.post('/', async (req, res) => {
  const parsed = parseItems(req.body?.items);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  let session;
  try {
    session = await mongoose.startSession();

    const order = await session.withTransaction(async () => {
      const requested = parsed.items;
      const pizzaIds = requested
        .filter((item) => item.itemType === 'pizza')
        .map((item) => item.itemId);
      const ingredientIds = requested
        .filter((item) => item.itemType === 'ingredient')
        .map((item) => item.itemId);

      const pizzas = pizzaIds.length
        ? await Pizza.find({ _id: { $in: pizzaIds } }).session(session)
        : [];
      const ingredients = ingredientIds.length
        ? await InventoryItem.find({ _id: { $in: ingredientIds } }).session(session)
        : [];

      const pizzaById = new Map(pizzas.map((pizza) => [pizza.id, pizza]));
      const ingredientById = new Map(ingredients.map((item) => [item.id, item]));

      const lines = [];
      const ingredientLines = [];

      for (const item of requested) {
        if (item.itemType === 'pizza') {
          const pizza = pizzaById.get(item.itemId);
          if (!pizza) {
            throw new OrderError(404, 'One or more items were not found');
          }

          assertValidPrice(pizza.price);
          const lineTotal = roundMoney(pizza.price * item.quantity);
          assertValidMoney(lineTotal);

          lines.push({
            itemType: 'pizza',
            itemId: pizza._id,
            name: pizza.name,
            slug: pizza.slug,
            category: pizza.category,
            stockUnit: '',
            unitPrice: pizza.price,
            quantity: item.quantity,
            lineTotal,
          });
          continue;
        }

        const ingredient = ingredientById.get(item.itemId);
        if (!ingredient) {
          throw new OrderError(404, 'One or more items were not found');
        }
        if (ingredient.stock < item.quantity) {
          throw new OrderError(400, `Insufficient stock for ${ingredient.name}`);
        }

        assertValidPrice(ingredient.price);
        const lineTotal = roundMoney(ingredient.price * item.quantity);
        assertValidMoney(lineTotal);

        lines.push({
          itemType: 'ingredient',
          itemId: ingredient._id,
          name: ingredient.name,
          slug: ingredient.slug,
          category: ingredient.category,
          stockUnit: ingredient.stockUnit,
          unitPrice: ingredient.price,
          quantity: item.quantity,
          lineTotal,
        });
        ingredientLines.push({
          id: ingredient._id,
          name: ingredient.name,
          quantity: item.quantity,
        });
      }

      const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
      assertValidMoney(subtotal);
      const total = subtotal;

      for (const line of ingredientLines) {
        const updated = await InventoryItem.findOneAndUpdate(
          { _id: line.id, stock: { $gte: line.quantity } },
          { $inc: { stock: -line.quantity } },
          { returnDocument: 'after', session }
        );

        if (!updated) {
          throw new OrderError(409, `Insufficient stock for ${line.name}`);
        }
      }

      const created = await Order.create(
        [
          {
            customer: req.user._id,
            items: lines,
            subtotal,
            total,
            status: 'placed',
          },
        ],
        { session }
      );

      return created[0];
    });

    res.status(201).json(order);
  } catch (err) {
    if (err instanceof OrderError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid order data' });
    }
    console.error('Order placement error:', err);
    res.status(500).json({ error: 'Could not place order. Please try again.' });
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (err) {
        console.error('Order session cleanup error:', err);
      }
    }
  }
});

router.post('/:id/payment', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  if (!razorpayService.isConfigured()) {
    return res.status(503).json({ error: 'Payment service is not configured' });
  }

  let keyId;
  try {
    keyId = razorpayService.getPublicKeyId();
  } catch (err) {
    if (err instanceof PaymentConfigError) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }
    throw err;
  }

  try {
    const order = await Order.findOne({ _id: id, customer: req.user._id });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.status === 'cancelled') {
      return res.status(409).json({ error: 'Cancelled orders cannot be paid' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(409).json({ error: 'Order is already paid' });
    }
    if (order.paymentStatus === 'refunded') {
      return res.status(409).json({ error: 'Order payment was refunded' });
    }

    if (order.razorpayOrderId && order.paymentAmount && order.paymentCurrency) {
      return res.json(checkoutInfo(order, keyId, req.user));
    }
    if (order.razorpayOrderId || order.paymentAmount || order.paymentCurrency) {
      return res.status(409).json({ error: 'Payment initialization is incomplete; please contact support' });
    }

    const amount = paymentAmountForOrder(order);
    if (!amount) {
      return res.status(400).json({ error: 'Order total is too low for online payment' });
    }

    let razorpayOrder;
    try {
      razorpayOrder = await razorpayService.createOrder({
        amount,
        currency: PAYMENT_CURRENCY,
        receipt: `${order._id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        notes: {
          appOrderId: order._id.toString(),
          customerId: req.user._id.toString(),
        },
      });
    } catch (err) {
      if (err instanceof PaymentConfigError) {
        return res.status(503).json({ error: 'Payment service is not configured' });
      }
      console.error('Razorpay order creation error:', err);
      return res.status(502).json({ error: 'Payment service unavailable' });
    }

    if (
      !razorpayOrder ||
      typeof razorpayOrder.id !== 'string' ||
      Number(razorpayOrder.amount) !== amount ||
      razorpayOrder.currency !== PAYMENT_CURRENCY
    ) {
      console.error('Razorpay order response validation failed');
      return res.status(502).json({ error: 'Payment service returned an invalid order' });
    }

    let updated;
    try {
      updated = await Order.findOneAndUpdate(
        {
          _id: order._id,
          customer: req.user._id,
          status: { $ne: 'cancelled' },
          razorpayOrderId: null,
          ...payablePaymentStatusFilter(),
        },
        {
          $set: {
            paymentStatus: 'pending',
            razorpayOrderId: razorpayOrder.id,
            paymentAmount: amount,
            paymentCurrency: PAYMENT_CURRENCY,
          },
        },
        { returnDocument: 'after', runValidators: true }
      );
    } catch (err) {
      console.error('Payment initialization database error:', err);
      return res.status(500).json({ error: 'Payment initialization could not be saved. Please retry.' });
    }

    if (!updated) {
      const latest = await Order.findOne({ _id: order._id, customer: req.user._id });
      if (!latest) {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (latest.status === 'cancelled') {
        return res.status(409).json({ error: 'Cancelled orders cannot be paid' });
      }
      if (latest.paymentStatus === 'paid') {
        return res.status(409).json({ error: 'Order is already paid' });
      }
      if (latest.paymentStatus === 'refunded') {
        return res.status(409).json({ error: 'Order payment was refunded' });
      }
      if (latest.razorpayOrderId && latest.paymentAmount && latest.paymentCurrency) {
        return res.json(checkoutInfo(latest, keyId, req.user));
      }
      return res.status(409).json({ error: 'Payment initialization changed; please retry' });
    }

    return res.status(201).json(checkoutInfo(updated, keyId, req.user));
  } catch (err) {
    if (err instanceof PaymentConfigError) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }
    console.error('Payment initialization error:', err);
    return res.status(500).json({ error: 'Payment initialization failed' });
  }
});

router.post('/:id/payment/verify', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  const razorpayOrderId = req.body?.razorpayOrderId ?? req.body?.razorpay_order_id;
  const razorpayPaymentId = req.body?.razorpayPaymentId ?? req.body?.razorpay_payment_id;
  const razorpaySignature = req.body?.razorpaySignature ?? req.body?.razorpay_signature;

  if (
    typeof razorpayOrderId !== 'string' ||
    typeof razorpayPaymentId !== 'string' ||
    typeof razorpaySignature !== 'string' ||
    !razorpayOrderId.trim() ||
    !razorpayPaymentId.trim() ||
    !razorpaySignature.trim()
  ) {
    return res.status(400).json({
      error: 'razorpayOrderId, razorpayPaymentId and razorpaySignature are required',
    });
  }
  if (!/^[0-9a-f]{64}$/i.test(razorpaySignature)) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }
  if (!razorpayService.isConfigured()) {
    return res.status(503).json({ error: 'Payment service is not configured' });
  }

  try {
    const order = await Order.findOne({ _id: id, customer: req.user._id });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.paymentStatus === 'paid') {
      if (
        order.razorpayOrderId === razorpayOrderId &&
        order.razorpayPaymentId === razorpayPaymentId
      ) {
        return res.json({ order, alreadyPaid: true });
      }
      return res.status(409).json({ error: 'Order is already paid' });
    }
    if (order.paymentStatus === 'refunded') {
      return res.status(409).json({ error: 'Order payment was refunded' });
    }
    if (order.status === 'cancelled') {
      return res.status(409).json({ error: 'Cancelled orders cannot be paid' });
    }
    if (!order.razorpayOrderId || !order.paymentAmount || !order.paymentCurrency) {
      return res.status(409).json({ error: 'Payment has not been initialized for this order' });
    }
    if (order.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({ error: 'Razorpay order does not match this order' });
    }

    let signatureValid;
    try {
      signatureValid = razorpayService.verifySignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      });
    } catch (err) {
      if (err instanceof PaymentConfigError) {
        return res.status(503).json({ error: 'Payment service is not configured' });
      }
      throw err;
    }
    if (!signatureValid) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    let payment;
    try {
      payment = await razorpayService.fetchPayment(razorpayPaymentId);
    } catch (err) {
      if (err instanceof PaymentConfigError) {
        return res.status(503).json({ error: 'Payment service is not configured' });
      }
      console.error('Razorpay payment fetch error:', err);
      const statusCode = err?.statusCode ?? err?.status_code;
      if (statusCode === 400 || statusCode === 404) {
        return res.status(400).json({ error: 'Payment could not be verified' });
      }
      return res.status(502).json({ error: 'Payment verification service unavailable' });
    }

    const matchesOrder = (candidate) =>
      candidate &&
      candidate.id === razorpayPaymentId &&
      candidate.order_id === order.razorpayOrderId &&
      Number(candidate.amount) === order.paymentAmount &&
      candidate.currency === order.paymentCurrency;

    if (!matchesOrder(payment)) {
      return res.status(400).json({ error: 'Payment details do not match this order' });
    }

    if (payment.status === 'authorized') {
      try {
        payment = await razorpayService.capturePayment(
          payment.id,
          payment.amount,
          payment.currency
        );
      } catch (err) {
        if (err instanceof PaymentConfigError) {
          return res.status(503).json({ error: 'Payment service is not configured' });
        }
        console.error('Razorpay payment capture error:', err);
        return res.status(502).json({ error: 'Payment could not be captured. Please retry verification.' });
      }
      if (!matchesOrder(payment)) {
        return res.status(400).json({ error: 'Payment details do not match this order' });
      }
    }

    if (payment.status !== 'captured' || payment.captured === false) {
      return res.status(400).json({ error: 'Payment is not captured' });
    }

    let updated;
    try {
      updated = await Order.findOneAndUpdate(
        {
          _id: order._id,
          customer: req.user._id,
          status: { $ne: 'cancelled' },
          razorpayOrderId: order.razorpayOrderId,
          ...payablePaymentStatusFilter(),
        },
        {
          $set: {
            paymentStatus: 'paid',
            razorpayPaymentId,
            paidAt: new Date(),
          },
        },
        { returnDocument: 'after', runValidators: true }
      );
    } catch (err) {
      console.error('Payment verification database error:', err);
      return res.status(500).json({
        error: 'Payment was verified but could not be recorded. Please retry verification.',
      });
    }

    if (!updated) {
      const latest = await Order.findOne({ _id: id, customer: req.user._id });
      if (!latest) {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (
        latest.paymentStatus === 'paid' &&
        latest.razorpayOrderId === razorpayOrderId &&
        latest.razorpayPaymentId === razorpayPaymentId
      ) {
        return res.json({ order: latest, alreadyPaid: true });
      }
      if (latest.paymentStatus === 'paid') {
        return res.status(409).json({ error: 'Order is already paid' });
      }
      if (latest.status === 'cancelled') {
        return res.status(409).json({ error: 'Cancelled orders cannot be paid' });
      }
      return res.status(409).json({ error: 'Order payment state changed; please retry' });
    }

    return res.json({ order: updated, alreadyPaid: false });
  } catch (err) {
    if (err instanceof PaymentConfigError) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }
    console.error('Payment verification error:', err);
    return res.status(500).json({ error: 'Payment verification failed' });
  }
});

router.get('/my', async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error('Order history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
