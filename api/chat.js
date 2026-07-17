// Vercel serverless function — keeps the Anthropic API key server-side.
// Configure ANTHROPIC_API_KEY as an environment variable in your Vercel project settings.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const SYSTEM_PROMPT = `You are the PM Assistant inside Trackline, a project management console.

You do two things:
1. Answer project management questions directly and practically (scheduling, agile/scrum, risk, estimation, stakeholder management, methodologies, etc). Keep answers concise and well-organized with short paragraphs or bullet points.
2. When the user asks you to create, draft, plan, or update a chart, respond with a short confirmation sentence AND a fenced json code block containing structured chart data. Use exactly one of these three shapes:

Gantt chart:
\`\`\`json
{"action":"gantt","data":[{"id":1,"name":"Task name","start":"YYYY-MM-DD","end":"YYYY-MM-DD","progress":0}]}
\`\`\`

Burndown chart:
\`\`\`json
{"action":"burndown","data":{"days":[{"day":0,"ideal":60,"actual":60}]}}
\`\`\`
(ideal decreases linearly from the starting total to 0 across the days; actual reflects a realistic, slightly uneven pace)

Kanban board:
\`\`\`json
{"action":"kanban","data":{"columns":[{"name":"To Do","cards":[{"id":"c1","title":"Card title"}]}]}}
\`\`\`

Rules for chart responses:
- Only emit ONE json block per reply, and only when the user is asking for a chart to be created or changed.
- Use realistic, specific task/card names based on what the user described — never placeholder text like "Task 1".
- Dates must be valid ISO YYYY-MM-DD. If the user gives a start date or duration, honor it; otherwise pick a sensible near-future date.
- card ids and task ids must be unique strings/numbers within the response.
- For plain PM questions with no chart involved, do not include a json block at all.
- Never wrap normal prose in a json block.`;

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ configured: Boolean(process.env.ANTHROPIC_API_KEY) });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
    return;
  }

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      res.status(apiRes.status).json({ error: data?.error?.message || "Anthropic API request failed" });
      return;
    }

    const reply = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    res.status(200).json({ reply });
  } catch (err) {
    res.status(500).json({ error: "Unexpected server error" });
  }
};
