import 'dotenv/config';

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import orderRoutes from './routes/orders.js';
import adminOrderRoutes from './routes/adminOrders.js';
import adminInventoryRoutes from './routes/adminInventory.js';
import { requireAuth } from './middleware/auth.js';
import { connectDB } from './config/db.js';

const app = express();
const port = process.env.PORT || 5000;

// Parse JSON bodies and cookies
app.use(express.json());
app.use(cookieParser());

// Enable CORS for the Vite dev server (any localhost port) with credentials.
// Using a regex so the backend keeps working when Vite falls back to 5174/5175
// because an earlier port is already in use.
app.use(cors({
  origin: /^http:\/\/localhost:\d+$/,
  credentials: true,
}));

// Health check (no DB needed)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// --- Auth routes ---
app.use('/api/auth', authRoutes);

// --- Catalog routes (public) ---
app.use('/api/catalog', catalogRoutes);

// --- Customer order routes ---
app.use('/api/orders', orderRoutes);

// --- Admin order routes ---
app.use('/api/admin/orders', adminOrderRoutes);

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