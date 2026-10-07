# ReNest Backend

NestJS + Prisma + PostgreSQL API.

## Requirements

- Node.js 22 (see `.nvmrc`)
- Docker

## Setup

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run start:dev
```

Health check: `GET http://localhost:3000/health`
