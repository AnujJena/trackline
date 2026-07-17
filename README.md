# Trackline — AI Project Console

A small web app that combines:
- **PM Assistant chat** — answers project management questions using Claude
- **Gantt chart** — task timelines
- **Burndown chart** — sprint progress
- **Kanban board** — drag-and-drop task columns

The assistant can draft or update any of the three charts directly from a chat request (e.g. *"Plan a 6-week app launch as a Gantt chart"*).

Everything runs as static files plus one serverless function (`/api/chat.js`), so it fits Vercel's free Hobby tier with no database and no build step.

---

## 1. Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and create an account if you don't have one.
2. Add a small amount of billing credit (this is the "small ongoing cost" — usage-based, typically a few cents per conversation with everyday use).
3. Create an API key under **API Keys** and copy it. You will paste this into Vercel in step 3 below — never into the code itself.

## 2. Put the project on GitHub

1. Create a new empty repository on [github.com](https://github.com/new) (e.g. `trackline`).
2. From this project folder, run:
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
2. Click **Add New → Project**, then import the GitHub repo you just pushed.
3. Framework preset: choose **Other** (no build step needed).
4. Before deploying, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` = *(the key you copied in step 1)*
   - Optional: `ANTHROPIC_MODEL` = `claude-sonnet-5` (default) or `claude-haiku-4-5-20251001` for a cheaper/faster model
5. Click **Deploy**.

Vercel will give you a free URL like `https://trackline-yourname.vercel.app` — that's your independent site. Every future `git push` to `main` redeploys it automatically.

## 4. (Alternative) Deploy from your computer without GitHub

If you'd rather skip GitHub:
```bash
npm install -g vercel
cd trackline
vercel login
vercel --prod
```
It will prompt you to set `ANTHROPIC_API_KEY` the first time, or you can add it afterwards from the Vercel dashboard under **Project Settings → Environment Variables**.

## Notes

- The API key is only ever read on the server (`api/chat.js`); it's never sent to the browser, so it's safe to deploy publicly.
- `GET /api/chat` returns `{configured: true|false}` so the UI can show whether the key is set — this is what the "Assistant online" indicator checks.
- To change the chart-drafting behavior or the assistant's tone, edit `SYSTEM_PROMPT` in `api/chat.js`.
- Free-tier Vercel functions have a request timeout (10s on Hobby); if you raise `max_tokens` a lot in `api/chat.js`, very long replies could occasionally hit that limit.
- Costs: you're billed by Anthropic per API call based on tokens used, not by Vercel (static hosting + serverless functions are free at this scale). A typical chat turn costs a fraction of a cent to a few cents depending on the model chosen.
