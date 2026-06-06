# OpenGalley

A self-hosted LaTeX editor built for developers, students, and researchers.

Create and manage multiple LaTeX projects directly from the browser, compile
documents using **full TeX Live + `latexmk`**.

Everything runs inside Docker — no local LaTeX installation required.

---

## Features

* Multi-project dashboard
* Browser-based LaTeX editing
* Full TeX Live environment
* PDF compilation with `latexmk`
* Persistent PostgreSQL storage
* Docker-first workflow
* No local TeX setup needed

---

## Quick Start

```bash
cp .env.example .env
docker compose up --build -d
```

Open the application at:

```txt
http://localhost:8088
```

You can override the default port using `WEB_PORT` in `.env`.

---

## Services

| Service      | URL                                |
| ------------ | ---------------------------------- |
| Web App      | `http://localhost:8088`            |
| API          | `http://localhost:4000`            |
| Health Check | `http://localhost:4000/api/health` |

---

## Notes

> The first build downloads the complete TeX Live image (~4–6 GB).
> This may take a while initially, but Docker caches everything afterward,
> making future compilations significantly faster.

---

## Data Persistence

| Resource        | Storage                      |
| --------------- | ---------------------------- |
| Metadata        | `postgres` (`pgdata` volume) |
| Project sources | `projects` Docker volume     |

---

## API Reference

| Method   | Endpoint                    | Description                                     |
| -------- | --------------------------- | ----------------------------------------------- |
| `GET`    | `/api/projects`             | List all projects                               |
| `POST`   | `/api/projects`             | Create a new project using the default template |
| `PATCH`  | `/api/projects/:id`         | Rename a project                                |
| `DELETE` | `/api/projects/:id`         | Delete a project                                |
| `GET`    | `/api/projects/:id/files`   | List project files                              |
| `PUT`    | `/api/projects/:id/files/*` | Create or update a file (autosave)              |
| `POST`   | `/api/projects/:id/compile` | Compile project → `{ ok, log }`                 |
| `GET`    | `/api/projects/:id/pdf`     | Download the latest compiled PDF                |