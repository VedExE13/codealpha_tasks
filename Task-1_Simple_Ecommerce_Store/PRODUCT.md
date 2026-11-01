# Product

Object Department Goods is a small demonstration storefront for useful everyday objects. Visitors should be able to discover products, understand their details, add them to a bag, and place an account-linked demo order.

## Audience and job

People browsing a compact catalog who want an uncomplicated, credible shopping flow on desktop or mobile.

## Product facts

- Eight seeded home, lifestyle, stationery, and tech products are served from SQLite.
- Product discovery includes category filtering, text search, and details.
- The bag is browser-persisted and supports item quantity and removal.
- Registration and login use the shared Express authentication implementation.
- Orders are demonstrations only; there is no payment provider or fulfillment.
- Each installation keeps its own local SQLite database under `data/`.

## Preserve

Keep the real store interactions discoverable and the order flow honest about being a demo. Do not imply that payments or shipping are live.
