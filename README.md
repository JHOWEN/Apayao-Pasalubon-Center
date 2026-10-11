# Apayao Pasalubong Center

Inventory, sales, and storefront application for Apayao Pasalubong Center. The app uses the Next.js App Router, TypeScript, Prisma, and PostgreSQL.

## Run locally

1. Install dependencies with `npm install`.
2. Configure the required values in `.env.local` using the [environment setup guide](docs/development/environment-setup.md). Never commit environment files or secret values.
3. Start the development server with `npm run dev`.
4. Open [http://localhost:3000](http://localhost:3000).

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run lint` | Run ESLint |
| `npm test` | Run the test suite |
| `npm run build` | Generate Prisma Client and build for production |

## Documentation

See the [documentation index](docs/README.md) for setup, deployment, user guides, security notes, and project plans.

Application routes live in `src/app`, shared utilities in `src/lib`, and the database schema in `prisma/schema.prisma`.
