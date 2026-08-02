# Trackline — AI Construction Project Console

A project console built specifically for construction project management:

- **AI Project Manager (chat)** — answers construction PM questions (scheduling, RFIs, change orders, safety, subcontractor coordination) and can draft or edit any log/chart from a request. Has its own dedicated page with a "previous chats" sidebar, plus an embedded copilot inside the working views.
- **Project Schedule** — Gantt-style task timeline
- **Site Task Board** — Kanban board for day-to-day/week-to-week site tasks
- **Schedule Burndown** — planned vs. actual progress over the job
- **RAID Log** — Risks, Assumptions, Issues, Dependencies
- **Daily Log** — site reports: weather, crew, work performed, delays
- **Submittals & RFIs** — number, subject, ball-in-court, due date, status
- **Punch List** — by location, trade, assigned sub, and status

Every project has a **type** (Residential / Commercial / Infrastructure) picked when you create it, which the assistant uses to tailor its advice.

Ask the assistant to edit anything already on screen (e.g. *"push framing back a week"*, *"mark RFI-014 as answered"*, *"add a punch list item for Unit 204"*) — it's shown the current state of your schedule/logs each time, so edits build on what's there.

Everything runs as static files plus one serverless function (`/api/chat.js`), so it fits Vercel's free Hobby tier with no database and no build step. Projects and chat history are saved in your browser's local storage — private to that browser/device.

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
- To change the assistant's tone or the construction knowledge it draws on, edit `BASE_SYSTEM_PROMPT` in `api/chat.js`.
- Free-tier Vercel functions have a 10-second timeout; if you raise `max_tokens` a lot, very long replies could occasionally hit that limit.
- Costs: Anthropic bills per API call based on tokens used, not Vercel (static hosting + serverless functions are free at this scale).
