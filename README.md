# B-Ride MVP

B-Ride is a local mobility app connecting passengers and private drivers using a fare bidding model.

## Technology Stack
- **Frontend**: React Native, Expo, TypeScript, Zustand, React Navigation, React Native Maps, Reanimated.
- **Backend**: Node.js, Express, MongoDB, Socket.io, JSON Web Tokens (JWT).

## Prerequisites
- Node.js (v18+)
- Local MongoDB or MongoDB Atlas URI
- Expo CLI
- Xcode Command Line Tools (macOS) or Android SDK

## Project Structure
- `/frontend` - Expo React Native application
- `/backend` - Express API & Socket.io server

## Setup & Running Locally

### Backend
1. `cd backend`
2. `npm install`
3. Copy `.env.example` to `.env` and fill the variables.
4. Start dev server: `npm run dev` (Runs on port 5001 by default).

### Frontend
1. `cd frontend`
2. `npm install`
3. Start Expo: `npx expo start`

### API Endpoints (Auth)
- `POST /api/auth/register` - Create new user (name, email, password, role)
- `POST /api/auth/login` - Authenticate user (email, password)
- `GET /api/auth/me` - Get current user profile (requires `Bearer` Token)
- `POST /api/auth/forgotpassword` - Generate reset token and email
- `PUT /api/auth/resetpassword/:token` - Set new password
- `POST /api/auth/refresh` - Refresh access token using long-lived refresh token

### Environment Variables
For the Backend, create a `.env` in `backend/` directory:
```
PORT=5001
MONGO_URI=mongodb://localhost:27017/bride
JWT_SECRET=tu-secreto-super-seguro
JWT_REFRESH_SECRET=tu-secreto-refresh-seguro
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_EMAIL=test@ethereal.email
SMTP_PASSWORD=password123
FROM_EMAIL=noreply@bride.com
FROM_NAME=B-Ride Admin
```
