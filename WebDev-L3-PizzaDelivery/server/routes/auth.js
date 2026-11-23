import express from 'express';
import User from '../Models/User.js';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../Services/emailService.js';
import { hashToken } from '../utils/token.js';

const router = express.Router();

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function issueAuthCookie(res, user) {
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

// --- POST /api/auth/register ---
router.post('/register', async (req, res) => {
  try {
    const name = req.body.name;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = new User({ name, email, password });
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const verifyUrl = `${clientUrl}/verify-email?token=${verificationToken}`;

    if (process.env.NODE_ENV !== 'production') {
      console.log('DEV verification URL:', verifyUrl);
    }

    sendEmail({
      to: user.email,
      subject: 'Verify your Pizza Delivery account',
      html: `<p>Hi ${user.name},</p><p>Thanks for signing up. Please verify your email:</p><p><a href="${verifyUrl}">Verify my email</a></p><p>This link expires in 24 hours.</p>`,
    }).catch((mailErr) => console.error('Verification email failed:', mailErr.message));

    res.status(201).json({
      message: 'Account created! Please check your email to verify your account.',
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- GET /api/auth/verify-email/:token ---
router.get('/verify-email/:token', async (req, res) => {
  try {
    const hashed = hashToken(req.params.token);
    const user = await User.findOne({
      emailVerificationToken: hashed,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully.' });
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- POST /api/auth/login ---
router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    issueAuthCookie(res, user);

    // Do NOT send the password or token in the response body
    res.json({ message: 'Login successful', user: publicUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- POST /api/auth/admin/login ---
router.post('/admin/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    issueAuthCookie(res, user);

    res.json({ message: 'Admin login successful', user: publicUser(user) });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- POST /api/auth/forgot-password ---
router.post('/forgot-password', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const genericMessage = 'If that email is registered, a reset link has been sent.';
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: genericMessage });
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

    if (process.env.NODE_ENV !== 'production') {
      console.log('DEV reset URL:', resetUrl);
    }

    sendEmail({
      to: user.email,
      subject: 'Reset your Pizza Delivery password',
      html: `<p>Hi ${user.name},</p><p>Reset your password using the link below:</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`,
    }).catch((mailErr) => console.error('Reset email failed:', mailErr.message));

    res.json({ message: genericMessage });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- POST /api/auth/reset-password/:token ---
router.post('/reset-password/:token', async (req, res) => {
  try {
    const password = req.body.password;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashed = hashToken(req.params.token);
    const user = await User.findOne({
      passwordResetToken: hashed,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- GET /api/auth/me (protected) ---
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// --- POST /api/auth/logout ---
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

export default router;