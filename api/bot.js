const SITE = "https://developer-portfolio-six-theta.vercel.app";
const BOT_NAME = "@bess1liebot";

// In-memory dialog state (chatId -> { step: 'service' | 'project' | 'contact', service })
// OK for a single-owner bot on Vercel; if an instance is recycled, the user can just
// start over with /start and any collected text is still forwarded to the owner.
const states = new Map();

const SERVICE_LABELS = {
  landing: "Лендинг (от 45 000₸)",
  corp: "Корпоративный сайт (от 75 000₸)",
  site_bot: "Сайт + Telegram-бот (от 100 000₸)",
  ai_admin: "AI-админ 24/7 (12 000₸/мес)",
  other: "Другое / задать вопрос",
};

async function tg(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram token is not configured");
  const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || data.ok !== true) {
    throw new Error("Telegram API request failed");
  }
  return data;
}

function menuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Лендинг (от 45 000₸)", callback_data: "service:landing" }],
      [{ text: "Корпоративный сайт (от 75 000₸)", callback_data: "service:corp" }],
      [{ text: "Сайт + бот (от 100 000₸)", callback_data: "service:site_bot" }],
      [{ text: "AI-админ 24/7 (12 000₸/мес)", callback_data: "service:ai_admin" }],
      [{ text: "Другое / задать вопрос", callback_data: "service:other" }],
      [{ text: "Посмотреть портфолио", url: SITE }],
    ],
  };
}

function cancelKeyboard() {
  return {
    inline_keyboard: [[{ text: "Отмена", callback_data: "cancel" }]],
  };
}

function restartKeyboard() {
  return {
    inline_keyboard: [[{ text: "Новый заказ", callback_data: "restart" }]],
  };
}

function userLabel(from) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || "—";
  const nick = from.username ? "@" + from.username : "—";
  return name + " (" + nick + ")";
}

function nowText() {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty", dateStyle: "short", timeStyle: "short",
  }).format(new Date());
}

async function sendStart(chatId) {
  states.delete(chatId);
  await tg("sendMessage", {
    chat_id: chatId,
    text: "Привет! Мы — команда bess1lie — помогаем заказать сайт или Telegram-бота для бизнеса.\n\nВыберите, что вас интересует:",
    reply_markup: menuKeyboard(),
  });
}

async function forwardToOwner(text) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;
  await tg("sendMessage", { chat_id: chatId, text });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const update = typeof req.body === "object" && req.body ? req.body : {};
  const chatId = String(
    (update.message && update.message.chat && update.message.chat.id) ||
    (update.callback_query && update.callback_query.message && update.callback_query.message.chat &&
      update.callback_query.message.chat.id) ||
    ""
  );
  if (!chatId) return res.status(200).json({ ok: true });

  try {
    // Inline-кнопки
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = String(cb.data || "");
      const from = cb.from || {};

      if (data === "restart") return sendStart(chatId).then(() => res.status(200).json({ ok: true }));
      if (data === "cancel") {
        states.delete(chatId);
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await tg("sendMessage", {
          chat_id: chatId,
          text: "Хорошо, отменяем. Если передумаете — нажмите /start.",
        });
        return res.status(200).json({ ok: true });
      }
      if (data.startsWith("service:")) {
        const service = data.slice("service:".length);
        states.set(chatId, { step: "project", service });
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
        await tg("sendMessage", {
          chat_id: chatId,
          text: "Отлично! " + (SERVICE_LABELS[service] || service) + ".\n\nРасскажите о проекте: какой у вас бизнес, что нужно сделать?",
          reply_markup: cancelKeyboard(),
        });
        return res.status(200).json({ ok: true });
      }
      await tg("answerCallbackQuery", { callback_query_id: cb.id });
      return res.status(200).json({ ok: true });
    }

    // Сообщения
    const msg = update.message || {};
    const text = String(msg.text || "").trim();
    const from = msg.from || {};

    if (text === "/start" || text === "/start@bess1liebot") {
      await sendStart(chatId);
      return res.status(200).json({ ok: true });
    }

    if (!text || text.startsWith("/")) {
      return res.status(200).json({ ok: true });
    }

    const st = states.get(chatId);

    if (st && st.step === "project") {
      states.set(chatId, { ...st, step: "contact", project: text.slice(0, 2000) });
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Понял вас. Как с вами связаться? (Telegram/телефон/email)",
        reply_markup: cancelKeyboard(),
      });
      return res.status(200).json({ ok: true });
    }

    if (st && st.step === "contact") {
      states.delete(chatId);
      const contact = text.slice(0, 500);
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Спасибо! Передадим заявку, мы свяжемся в течение нескольких часов.",
        reply_markup: restartKeyboard(),
      });
      await forwardToOwner(
        "\u{1F514} Новая заявка из бота " + BOT_NAME + "\n" +
        "\u{1F6E0} Услуга: " + (SERVICE_LABELS[st.service] || st.service) + "\n" +
        "\u{1F4DD} Проект: " + st.project + "\n" +
        "\u{1F4DE} Контакт: " + contact + "\n" +
        "\u{1F464} От: " + userLabel(from) + "\n" +
        "\u{1F552} Время: " + nowText()
      );
      return res.status(200).json({ ok: true });
    }

    // Произвольный текст вне wizard — пересылаем владельцу
    await tg("sendMessage", {
      chat_id: chatId,
      text: "Чтобы заказать сайт, нажмите /start и выберите услугу. Или напишите ваш вопрос — передам bess1lie.",
      reply_markup: menuKeyboard(),
    });
    await forwardToOwner(
      "\u{1F4AC} Сообщение из бота " + BOT_NAME + " (без заказа)\n" +
      "\u{1F464} От: " + userLabel(from) + "\n" +
      "\u{1F552} Время: " + nowText() + "\n" +
      "\u{1F5E8} Текст: " + text.slice(0, 2000)
    );
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "Telegram delivery failed" });
  }
}
