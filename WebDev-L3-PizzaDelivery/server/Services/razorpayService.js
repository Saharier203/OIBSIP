import crypto from 'node:crypto';
import Razorpay from 'razorpay';

export class PaymentConfigError extends Error {
  constructor(message = 'Payment service is not configured') {
    super(message);
    this.name = 'PaymentConfigError';
  }
}

function readCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret || !keyId.startsWith('rzp_test_')) {
    throw new PaymentConfigError();
  }
  return { keyId, keySecret };
}

let client = null;
let clientKeyId = null;
let clientKeySecret = null;

function getClient() {
  const { keyId, keySecret } = readCredentials();
  if (!client || clientKeyId !== keyId || clientKeySecret !== keySecret) {
    client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    clientKeyId = keyId;
    clientKeySecret = keySecret;
  }
  return client;
}

function isConfigured() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  return Boolean(keyId && keySecret && keyId.startsWith('rzp_test_'));
}

function getPublicKeyId() {
  return readCredentials().keyId;
}

async function createOrder({ amount, currency, receipt, notes }) {
  return getClient().orders.create({
    amount,
    currency,
    receipt,
    notes,
    payment: {
      capture: 'automatic',
      capture_options: {
        automatic_expiry_period: 12,
        manual_expiry_period: 7200,
        refund_speed: 'optimum',
      },
    },
  });
}

async function fetchPayment(paymentId) {
  return getClient().payments.fetch(paymentId);
}

async function capturePayment(paymentId, amount, currency) {
  return getClient().payments.capture(paymentId, amount, currency);
}

async function refundPayment(paymentId, { amount, notes, speed = 'optimum' } = {}) {
  return getClient().payments.refund(paymentId, { amount, notes, speed });
}

async function fetchRefund(paymentId, refundId) {
  return getClient().payments.fetchRefund(paymentId, refundId);
}

async function fetchRefundsForPayment(paymentId) {
  const result = await getClient().payments.fetchMultipleRefund(paymentId, { count: 100 });
  return Array.isArray(result?.items) ? result.items : [];
}

function verifySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const { keySecret } = readCredentials();

  if (
    typeof razorpayOrderId !== 'string' ||
    typeof razorpayPaymentId !== 'string' ||
    typeof razorpaySignature !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(razorpaySignature)
  ) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(razorpaySignature, 'hex');

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

export const razorpayService = {
  isConfigured,
  getPublicKeyId,
  createOrder,
  fetchPayment,
  capturePayment,
  refundPayment,
  fetchRefund,
  fetchRefundsForPayment,
  verifySignature,
};

export default razorpayService;
