# Pizza Delivery — Development Log

A full-stack pizza ordering application (customer storefront + admin dashboard) built with React on the frontend and Node.js/Express + MongoDB on the backend. This document records the steps taken while building the project.

## Tech Stack

- Frontend: React, Vite, React Router, Tailwind CSS (v4), Axios
- Backend: Node.js, Express (ES modules), MongoDB + Mongoose
- Auth: JWT stored in httpOnly cookies, bcrypt password hashing
- Payments: Razorpay (test mode)
- Email: Nodemailer

## Project Structure

```
OIBSIP/
├── .env.example
├── .gitignore
└── WebDev-L3-PizzaDelivery/
    ├── client/          # React frontend
    └── server/          # Express REST API
```

---

## Milestones

### 1. Project setup
- Created the `client` (Vite + React) and `server` (Express, ES modules) projects.
- Connected the server to MongoDB Atlas and added a shared `connectDB()` helper with an SRV-DNS fallback.
- Added environment configuration (`server/.env`, template in `.env.example`) and a health-check endpoint.

### 2. Backend authentication
- `User` model with bcrypt password hashing and hashed email-verification / password-reset tokens.
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.
- JWT issued as an httpOnly cookie; role-based middleware (`requireAuth`, `requireAdmin`, `requireCustomer`).
- Email verification and password-reset flows using Nodemailer (Ethereal in development).

### 3. Catalog & inventory
- `InventoryItem` model (categories: base, sauce, cheese, vegetable) and `Pizza` model.
- Idempotent seed script (`npm run seed`) that inserts missing records and never overwrites admin-edited data.
- Public `GET /api/catalog` returning grouped bases/sauces/cheeses/vegetables/pizzas.

### 4. Admin authentication & inventory API
- Admin seed script (`npm run seed:admin`) and `POST /api/auth/admin/login`.
- Admin-only inventory endpoints: list, create, update, and atomic stock adjustments.
- Duplicate checks, input validation, and protection against negative stock.

### 5. Customer orders API
- `Order` model with item snapshots (name, unit price, quantity, line total) and server-computed totals.
- `POST /api/orders` (customer only): validates items, checks ingredient stock, deducts stock, and creates the order inside a single MongoDB transaction (prevents overselling).
- `GET /api/orders/my`: returns the current customer's orders.

### 6. Admin order management
- `GET /api/admin/orders` with status filter and pagination; `PATCH /api/admin/orders/:id/status` enforcing valid status transitions.
- Cancelling an order restores ingredient stock exactly once (transactional).

### 7. Online payments (Razorpay, test mode)
- Payment fields added to the `Order` model (`paymentStatus`, Razorpay ids, amount in paise, etc.).
- `POST /api/orders/:id/payment` creates/reuses a Razorpay order; `POST /api/orders/:id/payment/verify` verifies the HMAC signature server-side and marks the order paid.
- Test-mode-only enforcement and safe error handling.

### 8. Refunds & paid-order cancellation
- Paid orders cannot be cancelled until refunded.
- `POST /api/admin/orders/:id/refund` issues a full Razorpay refund, confirms it, then cancels and restores stock.

### 9. Frontend foundation
- Set up routing, shared layout (header/footer), and Tailwind CSS v4 with a custom theme (cream, primary red, accent, charcoal).
- Replaced leftover starter styles so Tailwind controls the layout.

### 10. Frontend bug fixes
- Fixed a double `/api` prefix (`baseURL: '/api'` plus `/api/...` calls produced `/api/api/...` → 404) by using the shared axios instance with relative paths.
- Configured CORS to accept any localhost dev port (Vite sometimes runs on 5174 when 5173 is busy).
- Added `withCredentials` so the auth cookie is sent on every request.

### 11. Home page redesign
- Rebuilt the home page: hero section with the pizza image, signature pizza cards (Veg/Non-Veg badge, price in ₹), a "Build Your Pizza" 4-step section, and a features strip.
- Removed the legacy starter CSS and added the missing `--color-border` theme token so borders/backgrounds render correctly.

### 12. Frontend authentication
- Added an `AuthContext` (login, register, logout, session restore via `/auth/me`).
- Rewrote the Login and Register pages as working forms (validation, error messages, redirect-back after auth).
- Added a `ProtectedRoute` wrapper; the header now reflects the signed-in state.
- Browsing stays public; ordering and order history require login.

### 13. Repository cleanup
- Replaced the default Vite README with a project README.
- Replaced the Vite favicon with a pizza icon and removed unused framework logos and third-party social icons.
- Updated the page title and added a meta description.
- Confirmed no secrets, personal emails, or author names are present in tracked source.

---

## Current Status

### Implemented
- Backend: authentication, catalog, inventory, orders, payments, refunds, admin order management.
- Frontend: routing/layout, home page, login/register, auth context, protected routes.

### In progress
- Frontend menu + cart (add to cart, persisted cart, cart page).
- Checkout that creates an order.
- Customer order history + live status UI.
- Admin frontend pages (orders, inventory).

---

## API Overview

| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/api/auth/register` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/admin/login` | Public (admin accounts only) |
| GET | `/api/auth/me` | Authenticated |
| POST | `/api/auth/logout` | Public |
| GET | `/api/catalog` | Public |
| GET | `/api/admin/inventory` | Admin |
| POST | `/api/admin/inventory` | Admin |
| PATCH | `/api/admin/inventory/:id` | Admin |
| PATCH | `/api/admin/inventory/:id/stock` | Admin |
| POST | `/api/orders` | Customer |
| GET | `/api/orders/my` | Customer |
| POST | `/api/orders/:id/payment` | Customer |
| POST | `/api/orders/:id/payment/verify` | Customer |
| GET | `/api/admin/orders` | Admin |
| PATCH | `/api/admin/orders/:id/status` | Admin |
| POST | `/api/admin/orders/:id/refund` | Admin |

---

## How to Run

### Server
```
cd WebDev-L3-PizzaDelivery/server
npm install
# create server/.env (see ../.env.example for the required keys)
npm run seed
npm run seed:admin
npm run dev        # http://localhost:5000
```

### Client
```
cd WebDev-L3-PizzaDelivery/client
npm install
npm run dev        # Vite dev server (proxies /api to http://localhost:5000)
```

### Notes
- MongoDB must be reachable at `MONGODB_URI` (Atlas is used in development).
- Orders use MongoDB transactions, so the database must be a replica set (Atlas free tier is).
- Razorpay endpoints require test keys in `server/.env`; without them they return `503`.
- Never commit real secrets — use `.env.example` as a template.
