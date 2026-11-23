import mongoose, { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { createRawToken, hashToken } from '../utils/token.js';

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxLength: [50, 'Name must be <= 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})$/, 'Please fill a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minLength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

// Pre‑save hook: hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method: compare password for login
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method: generate email verification token (raw, will be hashed before storage)
userSchema.methods.generateEmailVerificationToken = function () {
  const token = createRawToken();
  this.emailVerificationToken = hashToken(token);
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h
  return token;
};

// Method: generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
  const token = createRawToken();
  this.passwordResetToken = hashToken(token);
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1h
  return token;
};

export default model('User', userSchema);