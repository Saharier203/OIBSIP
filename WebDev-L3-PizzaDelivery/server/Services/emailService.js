import nodemailer from 'nodemailer';

const isDev = process.env.NODE_ENV !== 'production';

// If SMTP credentials are provided via env, use them;
let transporter;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
} else if (isDev) {
  // Ethereal test account will be created lazily
  transporter = null;
} else {
  throw new Error('SMTP credentials required for production email sending');
}

// Lazy creation of Ethereal transporter if needed
async function getTransporter() {
  if (transporter) return transporter;
  if (isDev) {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('Ethereal test account ready for:', testAccount.user);
    return transporter;
  }
  return null;
}

export async function sendEmail({ to, subject, html }) {
  const tr = await getTransporter();
  if (!tr) {
    console.error('Email transporter not configured; skipping sendEmail');
    return;
  }
  const info = await tr.sendMail({
    from: `"Pizza Delivery" <${process.env.FROM_EMAIL || 'no-reply@pizzadelivery.local'}>`,
    to,
    subject,
    html,
  });
  console.log('Message sent: %s', info.messageId);
  if (isDev) {
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  }
}