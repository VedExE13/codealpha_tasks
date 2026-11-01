# CodeAlpha Full Stack Tasks

Three independent full-stack websites prepared for the November batch submission. Each folder can be installed and started on its own; each has its own Express server and SQLite database.

## Submission slots

- **Task 1 — Simple E-commerce Store** → `Task-1_Simple_Ecommerce_Store/` (CodeAlpha task 1)
- **Task 2 — Project Management Tool** → `Task-2_Project_Management_Tool/` (CodeAlpha task 3)
- **Task 3 — Real-Time Communication App** → `Task-3_Real_Time_Communication_App/` (CodeAlpha task 4)

The internship brief allows selecting two or three projects from its four-task list. This submission includes the e-commerce, project management, and communication projects. It does not include the separate social media project.

## Run a project

For the project you want to run, open its folder and follow that folder's README:

```sh
npm install
npm start
```

Each app uses port 3000 by default. To run multiple apps at once, set a different `PORT` for each process. A fresh SQLite database is created inside the selected project under `data/`; user data is not included in this repository.

## Technologies

HTML, CSS, JavaScript, Node.js, Express, and SQLite. The communication app also uses WebRTC, server-sent events, and the Web Crypto API.
