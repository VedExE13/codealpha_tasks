# CodeAlpha Project Management Tool

An independent full-stack submission for CodeAlpha Full Stack Development, Task 3. Use it to create shared projects, assign tasks, and keep decisions beside the work.

## Features

- Account registration and sign-in with a ready-to-use sample board.
- Multiple projects with member invitations by registered account email.
- To do, in progress, and done columns with drag-and-drop status changes.
- Task details, priorities, due dates, assignees, deletion, and comments.
- Responsive dashboard with light and dark themes and project-specific color accents.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open `http://localhost:3000`, then create an account to access your board. The sample tasks are starter content. SQLite data is created in `data/codealpha.db`; the database is excluded from Git.

## Stack

HTML, CSS, JavaScript, Express, and SQLite (`better-sqlite3`).

