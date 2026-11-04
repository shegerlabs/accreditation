# Welcome to Remix!

- 📖 [Remix docs](https://remix.run/docs)

## Development

Run the dev server:

```shellscript
npm run dev
```

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying Node applications, the built-in Remix app
server is production-ready.

Make sure to deploy the output of `npm run build`

- `build/server`
- `build/client`

### Azure (papsummit)

Every push to `main` builds the app and deploys it to the `papsummit` App
Service (`.github/workflows/main_papsummit.yml`). This is the public portal; the
admin side is `accreditationadmin`, deployed to `papsummitadmin`. Environment
variables come from the App Service's App settings, not from `.env`.

Both apps use the same production database. The admin repo owns the schema:
apply schema changes from there with `prisma db push`, and keep
`prisma/schema.prisma` here in step with it. Do not run `prisma db push` against
production from this repo.

Keep `npm start` free of tools from `node_modules/.bin` such as `cross-env`. The
workflow zips the app with `zip -r`, which copies the files those symlinks point
to instead of keeping the links, and the copied shims fail at startup on Azure.

### Local database

`docker-compose.yml` runs Postgres 16 on port 5432. It is the same setup as in
`accreditationadmin`, so run it from either repo, not both:

```sh
docker compose up -d
```

Point `DATABASE_URL` in `.env` at
`postgresql://postgres:postgres@localhost:5432/accreditation`, and create and
seed the database from `accreditationadmin` (`npx prisma db push`,
`npx prisma db seed`).

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already
configured for a simple default starting experience. You can use whatever css
framework you prefer. See the
[Vite docs on css](https://vitejs.dev/guide/features.html#css) for more
information.
