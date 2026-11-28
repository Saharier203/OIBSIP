import express from 'express';
import mongoose from 'mongoose';
import Order, { ORDER_STATUSES } from '../Models/Order.js';
import InventoryItem from '../Models/InventoryItem.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { razorpayService, PaymentConfigError } from '../Services/razorpayService.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);

const ORDER_STATUS_TRANSITIONS = {
  placed: ['preparing', 'cancelled'],
  preparing: ['out-for-delivery', 'cancelled'],
  'out-for-delivery': ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const REFUNDABLE_STATUSES = ['placed', 'preparing', 'out-for-delivery'];
const REFUND_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

class AdminOrderError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AdminOrderError';
    this.status = status;
  }
}

function parsePositiveInteger(value, field, { defaultValue, max } = {}) {
  if (value === undefined) {
    return { value: defaultValue };
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return { error: `${field} must be a positive integer` };
  }

  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    return { error: `${field} must be a positive integer` };
  }
  if (max !== undefined && number > max) {
    return { error: `${field} cannot exceed ${max}` };
  }
  return { value: number };
}

function parseStatusFilter(value) {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== 'string' || !ORDER_STATUSES.includes(value)) {
    return { error: `status must be one of: ${ORDER_STATUSES.join(', ')}` };
  }
  return { status: value };
}

function transitionError(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return `Order is already in status "${currentStatus}"`;
  }
  if (currentStatus === 'cancelled') {
    return 'Cancelled orders cannot be changed';
  }
  if (currentStatus === 'delivered') {
    return 'Delivered orders cannot be changed';
  }

  const allowed = ORDER_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    return `Cannot change order status from "${currentStatus}" to "${nextStatus}"`;
  }
  return null;
}

function isRefundableStatus(status) {
  return REFUNDABLE_STATUSES.includes(status);
}

function refundEligibilityError(order) {
  if (order.status === 'cancelled') {
    return 'Cancelled orders cannot be refunded';
  }
  if (!isRefundableStatus(order.status)) {
    return 'Only orders that can be cancelled can be refunded';
  }
  if (order.paymentStatus === 'refunded' || order.refundStatus === 'processed') {
    return 'Order has already been refunded';
  }
  if (order.paymentStatus !== 'paid') {
    return 'Only paid orders can be refunded';
  }
  if (
    typeof order.razorpayPaymentId !== 'string' ||
    !order.razorpayPaymentId.trim() ||
    typeof order.razorpayOrderId !== 'string' ||
    !order.razorpayOrderId.trim() ||
    !Number.isSafeInteger(order.paymentAmount) ||
    order.paymentAmount < 1 ||
    typeof order.paymentCurrency !== 'string' ||
    !order.paymentCurrency.trim()
  ) {
    return 'Order payment details are incomplete';
  }
  return null;
}

function paymentMatchesOrder(order, payment) {
  return (
    payment &&
    payment.id === order.razorpayPaymentId &&
    payment.order_id === order.razorpayOrderId &&
    Number(payment.amount) === order.paymentAmount &&
    payment.currency === order.paymentCurrency
  );
}

function refundMatchesOrder(order, refund) {
  return (
    refund &&
    typeof refund.id === 'string' &&
    refund.id.trim() &&
    refund.payment_id === order.razorpayPaymentId &&
    Number(refund.amount) === order.paymentAmount &&
    refund.currency === order.paymentCurrency
  );
}

function fullRefundForOrder(order, refunds) {
  const matching = (Array.isArray(refunds) ? refunds : []).filter((refund) =>
    refundMatchesOrder(order, refund)
  );
  return (
    matching.find((refund) => refund.status === 'processed') ||
    matching.find((refund) => refund.status === 'pending') ||
    null
  );
}

function refundStatusForStorage(status) {
  if (status === 'pending') {
    return 'pending';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return 'processing';
}

async function recordRefund(orderId, refund) {
  try {
    await Order.updateOne(
      {
        _id: orderId,
        paymentStatus: 'paid',
        refundStatus: { $in: ['processing', 'pending'] },
      },
      {
        $set: {
          razorpayRefundId: refund.id,
          refundAmount: refund.amount,
          refundStatus: refundStatusForStorage(refund.status),
        },
      }
    );
  } catch (err) {
    console.error('Refund state persistence error:', err);
  }
}

async function markRefundFailed(orderId, refund) {
  const update = {
    refundStatus: 'failed',
    refundInitiatedAt: null,
  };
  if (refund?.id) {
    update.razorpayRefundId = refund.id;
    update.refundAmount = refund.amount;
  }

  try {
    await Order.updateOne(
      {
        _id: orderId,
        paymentStatus: 'paid',
        refundStatus: { $in: ['processing', 'pending'] },
      },
      { $set: update }
    );
  } catch (err) {
    console.error('Refund failure state persistence error:', err);
  }
}

async function findExistingRefund(order) {
  if (order.razorpayRefundId) {
    const refund = await razorpayService.fetchRefund(
      order.razorpayPaymentId,
      order.razorpayRefundId
    );
    if (!refundMatchesOrder(order, refund)) {
      throw new AdminOrderError(502, 'Stored refund does not match this order');
    }
    return refund;
  }

  const refunds = await razorpayService.fetchRefundsForPayment(order.razorpayPaymentId);
  return fullRefundForOrder(order, refunds);
}

async function claimRefund(orderId) {
  return Order.findOneAndUpdate(
    {
      _id: orderId,
      paymentStatus: 'paid',
      status: { $in: REFUNDABLE_STATUSES },
      $or: [
        { refundStatus: { $in: ['none', 'failed'] } },
        { refundStatus: { $exists: false } },
      ],
    },
    {
      $set: {
        refundStatus: 'processing',
        refundInitiatedAt: new Date(),
        razorpayRefundId: null,
        refundAmount: null,
        refundedAt: null,
      },
    },
    { returnDocument: 'after', runValidators: true }
  );
}

function refundClaimIsStale(value) {
  if (!value) {
    return true;
  }
  const time = new Date(value).getTime();
  return !Number.isFinite(time) || Date.now() - time > REFUND_CLAIM_TIMEOUT_MS;
}

async function claimOrRecoverRefund(orderId) {
  const claimed = await claimRefund(orderId);
  if (claimed) {
    return { order: claimed, claimed: true };
  }

  const current = await Order.findById(orderId);
  if (!current) {
    throw new AdminOrderError(404, 'Order not found');
  }
  if (current.paymentStatus === 'refunded' || current.refundStatus === 'processed') {
    throw new AdminOrderError(409, 'Order has already been refunded');
  }
  if (current.paymentStatus !== 'paid') {
    throw new AdminOrderError(409, 'Only paid orders can be refunded');
  }
  if (!isRefundableStatus(current.status)) {
    throw new AdminOrderError(409, 'Only orders that can be cancelled can be refunded');
  }

  if (
    current.refundStatus === 'processing' &&
    !current.razorpayRefundId &&
    refundClaimIsStale(current.refundInitiatedAt)
  ) {
    const reset = await Order.findOneAndUpdate(
      {
        _id: current._id,
        paymentStatus: 'paid',
        refundStatus: 'processing',
        razorpayRefundId: null,
        refundInitiatedAt: current.refundInitiatedAt ?? null,
      },
      { $set: { refundStatus: 'none', refundInitiatedAt: null } },
      { returnDocument: 'after' }
    );
    if (reset) {
      const retried = await claimRefund(orderId);
      if (retried) {
        return { order: retried, claimed: true };
      }
    }
  }

  return { order: current, claimed: false };
}

async function finalizeRefund(orderId, refund) {
  let session;
  try {
    session = await mongoose.startSession();

    return await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) {
        throw new AdminOrderError(404, 'Order not found');
      }
      if (order.paymentStatus === 'refunded' || order.status === 'cancelled') {
        throw new AdminOrderError(409, 'Order has already been refunded');
      }
      if (order.paymentStatus !== 'paid') {
        throw new AdminOrderError(409, 'Only paid orders can be refunded');
      }
      if (!isRefundableStatus(order.status)) {
        throw new AdminOrderError(409, 'Only orders that can be cancelled can be refunded');
      }

      const hasStoredRefund = order.razorpayRefundId === refund.id;
      const canAdoptRefund =
        !order.razorpayRefundId && ['processing', 'pending'].includes(order.refundStatus);
      if (!hasStoredRefund && !canAdoptRefund) {
        throw new AdminOrderError(409, 'Refund state changed; please retry');
      }

      const updated = await Order.findOneAndUpdate(
        {
          _id: order._id,
          status: order.status,
          paymentStatus: 'paid',
          $or: [
            { razorpayRefundId: refund.id },
            {
              razorpayRefundId: null,
              refundStatus: { $in: ['processing', 'pending'] },
            },
          ],
        },
        {
          $set: {
            status: 'cancelled',
            paymentStatus: 'refunded',
            refundStatus: 'processed',
            razorpayRefundId: refund.id,
            refundAmount: refund.amount,
            refundedAt: new Date(),
            refundInitiatedAt: null,
          },
        },
        { returnDocument: 'after', session, runValidators: true }
      );

      if (!updated) {
        throw new AdminOrderError(409, 'Order state changed; please retry');
      }

      await restoreIngredientStock(order, session);
      return updated;
    });
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (err) {
        console.error('Refund session cleanup error:', err);
      }
    }
  }
}

async function restoreIngredientStock(order, session) {
  const quantities = new Map();

  for (const line of order.items) {
    if (line.itemType !== 'ingredient') {
      continue;
    }
    if (!line.itemId || !mongoose.isValidObjectId(line.itemId)) {
      throw new AdminOrderError(409, `Cannot cancel order: invalid inventory reference for "${line.name}"`);
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new AdminOrderError(409, `Cannot cancel order: invalid ingredient quantity for "${line.name}"`);
    }

    const key = line.itemId.toString();
    const existing = quantities.get(key);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      quantities.set(key, {
        id: line.itemId,
        name: line.name,
        quantity: line.quantity,
      });
    }
  }

  for (const item of quantities.values()) {
    const updated = await InventoryItem.findOneAndUpdate(
      { _id: item.id },
      { $inc: { stock: item.quantity } },
      { returnDocument: 'after', session }
    );

    if (!updated) {
      throw new AdminOrderError(409, `Cannot cancel order: inventory item "${item.name}" no longer exists`);
    }
    if (!Number.isFinite(updated.stock)) {
      throw new AdminOrderError(409, `Cannot cancel order: inventory item "${item.name}" has invalid stock`);
    }
  }
}

router.get('/', async (req, res) => {
  const statusFilter = parseStatusFilter(req.query.status);
  if (statusFilter.error) {
    return res.status(400).json({ error: statusFilter.error });
  }

  const page = parsePositiveInteger(req.query.page, 'page', { defaultValue: DEFAULT_PAGE });
  if (page.error) {
    return res.status(400).json({ error: page.error });
  }

  const limit = parsePositiveInteger(req.query.limit, 'limit', {
    defaultValue: DEFAULT_LIMIT,
    max: MAX_LIMIT,
  });
  if (limit.error) {
    return res.status(400).json({ error: limit.error });
  }

  try {
    const filter = statusFilter.status ? { status: statusFilter.status } : {};
    const skip = (page.value - 1) * limit.value;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('customer', 'name email')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit.value),
      Order.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit.value);
    res.json({
      orders,
      pagination: {
        page: page.value,
        limit: limit.value,
        total,
        totalPages,
      },
    });
  } catch (err) {
    console.error('Admin order list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  const nextStatus = req.body?.status;
  if (typeof nextStatus !== 'string' || !ORDER_STATUSES.includes(nextStatus)) {
    return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` });
  }

  let session;
  try {
    session = await mongoose.startSession();

    const updatedOrder = await session.withTransaction(async () => {
      const order = await Order.findById(id).session(session);
      if (!order) {
        throw new AdminOrderError(404, 'Order not found');
      }

      const invalidTransition = transitionError(order.status, nextStatus);
      if (invalidTransition) {
        throw new AdminOrderError(409, invalidTransition);
      }

      if (nextStatus === 'cancelled' && order.paymentStatus === 'paid') {
        throw new AdminOrderError(409, 'Paid orders cannot be cancelled until the payment is refunded');
      }

      const updated = await Order.findOneAndUpdate(
        { _id: order._id, status: order.status },
        { $set: { status: nextStatus } },
        { returnDocument: 'after', session, runValidators: true }
      );

      if (!updated) {
        throw new AdminOrderError(409, 'Order status changed; please retry');
      }

      if (nextStatus === 'cancelled') {
        await restoreIngredientStock(order, session);
      }

      return updated;
    });

    res.json(updatedOrder);
  } catch (err) {
    if (err instanceof AdminOrderError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid order status' });
    }
    console.error('Admin order status update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (err) {
        console.error('Admin order session cleanup error:', err);
      }
    }
  }
});

router.post('/:id/refund', async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  if (!razorpayService.isConfigured()) {
    return res.status(503).json({ error: 'Payment service is not configured' });
  }

  try {
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const eligibilityError = refundEligibilityError(order);
    if (eligibilityError) {
      return res.status(409).json({ error: eligibilityError });
    }

    let payment;
    try {
      payment = await razorpayService.fetchPayment(order.razorpayPaymentId);
    } catch (err) {
      if (err instanceof PaymentConfigError) {
        return res.status(503).json({ error: 'Payment service is not configured' });
      }
      console.error('Razorpay payment fetch error:', err);
      const statusCode = err?.statusCode ?? err?.status_code;
      if (statusCode === 400 || statusCode === 404) {
        return res.status(409).json({ error: 'Stored payment could not be found' });
      }
      return res.status(502).json({ error: 'Payment service unavailable' });
    }

    if (!paymentMatchesOrder(order, payment)) {
      return res.status(409).json({ error: 'Stored payment does not match this order' });
    }
    if (!['captured', 'refunded'].includes(payment.status)) {
      return res.status(409).json({ error: 'Payment is not captured and cannot be refunded' });
    }

    const amountRefunded = Number(payment.amount_refunded) || 0;
    if (
      payment.refund_status === 'partial' ||
      (amountRefunded > 0 && amountRefunded < order.paymentAmount)
    ) {
      return res.status(409).json({ error: 'Order has a partial refund; manual review is required' });
    }
    const paymentAlreadyRefunded =
      payment.status === 'refunded' ||
      payment.refund_status === 'full' ||
      amountRefunded >= order.paymentAmount;

    const { order: refundOrder, claimed } = await claimOrRecoverRefund(id);

    let refund;
    try {
      refund = await findExistingRefund(refundOrder);
    } catch (err) {
      if (err instanceof PaymentConfigError) {
        return res.status(503).json({ error: 'Payment service is not configured' });
      }
      if (err instanceof AdminOrderError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Refund lookup error:', err);
      return res.status(502).json({ error: 'Refund status could not be confirmed. Please retry.' });
    }

    if (!refund) {
      if (paymentAlreadyRefunded) {
        return res.status(409).json({
          error: 'Payment is already refunded but the refund record is not available yet; please retry',
        });
      }
      if (!claimed) {
        return res.status(409).json({ error: 'Refund is already in progress; please retry' });
      }

      try {
        refund = await razorpayService.refundPayment(refundOrder.razorpayPaymentId, {
          amount: refundOrder.paymentAmount,
          speed: 'optimum',
          notes: {
            appOrderId: refundOrder._id.toString(),
            reason: 'admin_cancellation',
          },
        });
      } catch (err) {
        if (err instanceof PaymentConfigError) {
          await markRefundFailed(refundOrder._id);
          return res.status(503).json({ error: 'Payment service is not configured' });
        }
        console.error('Razorpay refund creation error:', err);

        let existingRefund = null;
        try {
          existingRefund = await findExistingRefund(refundOrder);
        } catch (lookupErr) {
          if (lookupErr instanceof PaymentConfigError) {
            return res.status(503).json({ error: 'Payment service is not configured' });
          }
          console.error('Refund recovery lookup error:', lookupErr);
          return res.status(502).json({
            error: 'Refund status could not be confirmed. Please retry.',
          });
        }

        if (existingRefund) {
          refund = existingRefund;
        } else {
          const statusCode = err?.statusCode ?? err?.status_code;
          if (Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 500) {
            await markRefundFailed(refundOrder._id);
          }
          return res.status(502).json({ error: 'Refund could not be created' });
        }
      }

      if (!refundMatchesOrder(refundOrder, refund)) {
        console.error('Razorpay refund response validation failed');
        return res.status(502).json({ error: 'Payment service returned an invalid refund' });
      }
    }

    await recordRefund(refundOrder._id, refund);

    if (refund.status === 'failed') {
      await markRefundFailed(refundOrder._id, refund);
      return res.status(502).json({ error: 'Refund failed' });
    }
    if (refund.status === 'pending') {
      const pendingOrder = await Order.findById(refundOrder._id);
      return res.status(202).json({
        order: pendingOrder,
        message: 'Refund is pending confirmation',
      });
    }
    if (refund.status !== 'processed') {
      return res.status(502).json({ error: 'Refund status could not be confirmed' });
    }

    try {
      const updated = await finalizeRefund(refundOrder._id, refund);
      return res.json(updated);
    } catch (err) {
      if (err instanceof AdminOrderError) {
        return res.status(err.status).json({
          error: `Refund was processed but the order could not be cancelled: ${err.message}`,
        });
      }
      console.error('Refund finalization error:', err);
      return res.status(500).json({
        error:
          'Refund was processed but the order could not be updated. Please retry to complete cancellation.',
      });
    }
  } catch (err) {
    if (err instanceof PaymentConfigError) {
      return res.status(503).json({ error: 'Payment service is not configured' });
    }
    if (err instanceof AdminOrderError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Admin refund error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
