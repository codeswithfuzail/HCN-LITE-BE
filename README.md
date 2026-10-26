# HCM Lite API

## Local setup

1. Install Node.js 20 or newer and MongoDB (local MongoDB or MongoDB Atlas).
2. Copy `.env.example` to `.env` and set `MONGODB_URI` and a random `JWT_SECRET` (at least 24 characters). Keep `.env` private; it is ignored by Git.
3. Run `npm install`, then `npm run dev`.
4. Open `http://localhost:4000/api/health` to check the process and `/api/ready` to check database readiness.
5. Open the frontend and use **Set up your company** for first-run setup. The optional `ADMIN_EMAIL` and `ADMIN_PASSWORD` bootstrap an initial admin only when no admin exists.

## Vercel deployment

Deploy this directory as the backend project's root. Set these environment variables in Vercel for every environment you deploy:

- `MONGODB_URI`: Atlas connection URI. Atlas must allow connections from the serverless deployment.
- `JWT_SECRET`: private random value, at least 24 characters.
- `FRONTEND_URL`: exact frontend origin, for example `https://your-frontend.vercel.app` (no path). Multiple origins may be comma-separated.
- `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`: optional; set only to enable AI features.

The frontend must use `VITE_API_BASE_URL=https://your-backend.vercel.app/api`. The frontend normalizes a backend hostname too, but the explicit full URL is recommended. Vercel environment changes and code changes take effect after a deployment. Do not commit `.env` or paste credentials into issue reports.

## API groups

All application routes are under `/api`. Public: `GET /health`, `GET /ready`, `GET /setup/status`, `POST /setup/initialize`, `POST /auth/login`. Authenticated routes include `/auth/me`, `/auth/logout`, `/auth/change-password`, `/organization`, `/departments`, `/designations`, `/leave-types`, `/holidays`, `/users`, `/employees`, `/attendance`, `/leaves`, `/salaries`, `/payroll`, `/payslips`, `/dashboard`, `/analytics`, `/announcements`, `/notifications`, `/audit`, and `/ai`. Access is enforced by backend role middleware; employee-scoped data is restricted to the signed-in employee. See `src/app.js` for each method, request schema, and role gate.

## Verification

Run `npm test`. These unit tests cover database-independent health behavior and payroll calculation rules. Live login and database-backed workflows require a configured MongoDB connection and are not exercised by the unit suite.
