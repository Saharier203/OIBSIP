import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';

const app = express();
const port = process.env.PORT || 5000;

// Simple body-parser for JSON
app.use(express.json());

// Health check (no DB needed)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// --- Auth routes ---
app.use('/api/auth', authRoutes);

// --- Protected example route (demo) ---
app.get('/api/protected', (req, res) => {
  try {
    // req.user is attached by the requireAuth middleware (not shown here yet)
    res.json({ message: 'This is a protected route', user: req.user });
  } catch (err) {
    res.status(500).json({ error: 'Auth middleware failed' });
  }
});

// Connect to MongoDB (best‑effort; server starts even if DB is down)
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(port, () => console.log(`Server running on port ${port}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error (server still starting):', err.message);
    // Still start the HTTP server even if DB is unavailable
    app.listen(port, () => console.log(`Server running on port ${port} (DB connection failed)`));
  });