# Pizza Delivery

A full-stack pizza ordering web application with a customer storefront and an admin dashboard.

## Tech stack

- Frontend: React, Vite, React Router, Tailwind CSS, Axios
- Backend: Node.js, Express, MongoDB (Mongoose)
- Auth: JWT stored in httpOnly cookies, bcrypt password hashing
- Payments: Razorpay (test mode)
- Email: Nodemailer

## Project structure

- `client/` — React storefront and admin UI
- `server/` — Express REST API

## Running locally

### Server

```
cd server
npm install
# create server/.env with MONGODB_URI, JWT_SECRET, etc. (see ../.env.example)
npm run seed        # seed catalog + inventory (idempotent)
npm run seed:admin  # create the admin account from ADMIN_* env vars
npm run dev         # starts the API on http://localhost:5000
```

### Client

```
cd client
npm install
npm run dev         # starts Vite (proxies /api to http://localhost:5000)
```

## Notes

- Payment endpoints require Razorpay test keys in `server/.env`.
- Never commit real secrets; use the `.env.example` placeholders as a template.
