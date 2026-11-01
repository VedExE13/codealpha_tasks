# CodeAlpha Simple E-commerce Store

An independent full-stack submission for CodeAlpha Full Stack Development, Task 1. The shop focuses on everyday home, lifestyle, stationery, and tech goods.

## Features

- Searchable products with category filters and individual detail views.
- Shopping bag with quantity controls and saved browser state.
- Account registration and sign-in.
- Demo order processing backed by SQLite. No payment is collected.
- Responsive editorial storefront with light and dark themes.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open `http://localhost:3000`. The first account can browse and place a demo order after signing in. SQLite data is created in `data/codealpha.db`; the database is excluded from Git.

## Stack

HTML, CSS, JavaScript, Express, and SQLite (`better-sqlite3`).

