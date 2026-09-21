export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  let body = {};
  try { body = typeof req.body === "object" && req.body ? req.body : {}; }
  catch (e) { return res.status(400).json({ ok: false, error: "Bad JSON" }); }

  const name = String(body.name || "").trim();
  const contact = String(body.contact || "").trim();
  const description = String(body.description || "").trim();
  const interest = String(body.interest || "").trim();
  const website = String(body.website || "").trim(); // honeypot

  // Honeypot: если бот заполнил скрытое поле — молча "принять", в TG не слать
  if (website) return res.status(200).json({ ok: true });

  // Валидация
  if (!name || !contact) {
    return res.status(400).json({ ok: false, error: "Заполните имя и контакт." });
  }
  if (name.length > 100 || contact.length > 200 || description.length > 2000 || interest.length > 50) {
    return res.status(400).json({ ok: false, error: "Слишком длинное значение." });
  }
  const interestLabels = { site: "Сайт", ai_admin: "AI-админ", both: "Сайт + AI-админ" };
  const interestLabel = interestLabels[interest] || interest || "—";

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(500).json({ ok: false, error: "Server not configured." });
  }

  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty", dateStyle: "short", timeStyle: "short"
  }).format(new Date());

  const text =
    "\u{1F514} Новая заявка с сайта\n" +
    "\u{1F464} Имя: " + name + "\n" +
    "\u{1F4DE} Контакт: " + contact + "\n" +
    "\u{1F3AF} Интерес: " + interestLabel + "\n" +
    "\u{1F4DD} Проект: " + (description || "—") + "\n" +
    "\u{1F552} Время: " + time;

  try {
    const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    const data = await r.json();
    if (!data.ok) {
      return res.status(502).json({ ok: false, error: "Telegram error." });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "Telegram unreachable." });
  }
}
