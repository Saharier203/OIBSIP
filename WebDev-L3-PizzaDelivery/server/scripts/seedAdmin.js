import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../Models/User.js';

const email = typeof process.env.ADMIN_EMAIL === 'string' ? process.env.ADMIN_EMAIL.trim().toLowerCase() : '';
const password = process.env.ADMIN_PASSWORD;
const name = (process.env.ADMIN_NAME || 'Administrator').trim();

async function seedAdmin() {
  try {
    if (!email || !password) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in server/.env');
    }
    if (password.length < 8) {
      throw new Error('ADMIN_PASSWORD must be at least 8 characters');
    }
    if (!name || name.length > 50) {
      throw new Error('ADMIN_NAME must be between 1 and 50 characters');
    }

    await connectDB();
    console.log('Connected to MongoDB');

    const existing = await User.findOne({ email });

    if (existing) {
      if (existing.role !== 'admin') {
        throw new Error(`A non-admin account already uses ${email}. Choose a different ADMIN_EMAIL.`);
      }
      console.log(`Admin already exists: ${email} (password left unchanged).`);
      return;
    }

    const admin = new User({
      name,
      email,
      password,
      role: 'admin',
      isEmailVerified: true,
    });
    await admin.save();

    console.log(`Admin created: ${email}`);
    console.log('Admin password was read from ADMIN_PASSWORD and is not printed.');
  } catch (err) {
    console.error('Admin seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin();
