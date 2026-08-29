# Trackline — AI Construction Project Console

A project console built specifically for construction project management. Everything below is fully unlocked — there's no paid tier or locked feature, since this is your own free, self-hosted build.

**Access:** the app sits behind a simple login screen (username `admin`, password `admin`). This is a demo-only gate, not real security — the credentials are visible in the front-end source and there's no server-side check, so anyone with the URL can bypass it via browser dev tools. Use it only to keep casual visitors out, not to protect sensitive data.

**Core field modules** — each can be filled in manually (a "+ Add" button opens a form), by the AI assistant, or imported from a spreadsheet (every tab has "⬇ Template" / "⬆ Upload" buttons):
- **Project Schedule** — Gantt-style task timeline; scrolls horizontally on long schedules
- **Site Task Board** — Kanban board for day-to-day/week-to-week site tasks
- **Schedule Burndown** — planned vs. actual progress over the job
- **RAID Log** — Risks, Assumptions, Issues, Dependencies. Status is a click-to-update radio group right in the table.
- **Daily Log** — site reports: weather, crew, work performed, delays
- **Submittals & RFIs** — number, subject, ball-in-court, due date, status (inline radio-button status)
- **Punch List** — by location, trade, assigned sub, and status (inline radio-button status)

**Run-the-job modules:**
- **Dashboard** — a live snapshot of the project: a computed **Project Health Score** (0–100, weighted from schedule/budget/RAID/punch-list health), schedule/budget/open-item stats, four charts (task status, budget comparison, RAID by status, attendance trend), crew workload, and the Site Ops live view. A 15-second auto-refresh toggle is available.
- **Team & Timesheets** — crew roster, logged hours, weekly workload view
- **Site Ops** — Materials (with unit of measurement and usage %), Attendance (inline radio status), Machinery (inline radio status)
- **Budget & Cost** — line items with estimated vs. actual and running variance
- **Calendar** — every dated item across schedule, daily log, and submittals in one view
- **Portfolio** — an all-projects overview (from the landing page nav)

**Planning & analysis modules:**
- **Project Charter** (highlighted tab, marked with a star) — a single-record form: purpose, objectives, scope, stakeholders, sponsor, milestones, success criteria, sign-off
- **Project Crashing** — enter each task's normal vs. crash duration/cost; Trackline computes cost-per-day-saved and flags the three cheapest tasks to compress first
- **WBS** — a two-level Work Breakdown Structure (phases → work packages) with standard WBS numbering
- **Inventory** — stock on hand with reorder levels; low-stock items are flagged automatically

Every row/card has a small "×" to delete it, and every tab has a "⟳ Refresh" button that reloads the tab from saved data. **The AI assistant can update several tabs from a single request** — e.g. "set up this whole project" can populate the schedule, budget, and team roster together in one reply. It's reachable both as an embedded copilot inside the workspace and as a dedicated full-page chat with a "previous chats" sidebar.

Every project has a **type** (Residential / Commercial / Infrastructure) picked when you create it, which the assistant uses to tailor its advice.

Everything runs as static files plus one serverless function (`/api/chat.js`), so it fits Vercel's free Hobby tier with no database and no build step. All project data is saved in your browser's local storage — private to that browser/device.

---

## 1. Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and create an account if you don't have one.
2. Add a small amount of billing credit — usage-based, typically a few cents per conversation with everyday use.
3. Create an API key under **API Keys** and copy it. You'll paste this into Vercel in step 3 below — never into the code itself.

## 2. Put the project on GitHub

1. Create a new empty repository on [github.com](https://github.com/new) (e.g. `trackline`).
2. Upload all the files in this folder (keeping `api/chat.js` inside an `api` folder) via **Add file → Upload files**, or via git:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/trackline.git
   git push -u origin main
   ```

## 3. Deploy on Vercel (free)

1. Go to [vercel.com](https://vercel.com) and sign up (the free Hobby plan is enough).
2. **Add New → Project** → import the GitHub repo.
3. Framework preset: **Other** (no build step needed).
4. Under **Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = *(your key from step 1)*
   - Optional: `ANTHROPIC_MODEL` = `claude-sonnet-5` (default) or `claude-haiku-4-5-20251001` for a cheaper/faster model
5. Click **Deploy**.

You'll get a free URL like `https://trackline-yourname.vercel.app`.

## Notes

- The API key only ever lives on the server (`api/chat.js`) — never sent to the browser, so it's safe to deploy publicly.
- The `admin`/`admin` login is a front-end-only gate. Do not rely on it to protect anything sensitive.
- To change the assistant's tone or the construction knowledge it draws on, edit `BASE_SYSTEM_PROMPT` in `api/chat.js`.
- Free-tier Vercel functions have a 10-second timeout; if you raise `max_tokens` a lot, very long replies could occasionally hit that limit.
- Costs: Anthropic bills per API call based on tokens used, not Vercel (static hosting + serverless functions are free at this scale).
