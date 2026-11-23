import 'dotenv/config';

import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import adminInventoryRoutes from './routes/adminInventory.js';
import { requireAuth } from './middleware/auth.js';
import { connectDB } from './config/db.js';

const app = express();
const port = process.env.PORT || 5000;

// Parse JSON bodies and cookies
app.use(express.json());
app.use(cookieParser());

// Health check (no DB needed)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// --- Auth routes ---
app.use('/api/auth', authRoutes);

// --- Catalog routes (public) ---
app.use('/api/catalog', catalogRoutes);

// --- Admin inventory routes ---
app.use('/api/admin/inventory', adminInventoryRoutes);

// --- Protected example route (demo) ---
app.get('/api/protected', requireAuth, (req, res) => {
  res.json({ message: 'This is a protected route', user: req.user });
});

try {
  await connectDB();
  console.log('Connected to MongoDB');
} catch (err) {
  console.error('MongoDB connection error (server still starting):', err.message);
}

app.listen(port, () => console.log(`Server running on port ${port}`));