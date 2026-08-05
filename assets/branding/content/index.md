# bess1lie — Branding Visual Content (Instagram + Telegram)

Сгенерировано скриптом `gen.js` + `gen.html` (Canvas API в headless Chromium).
Все файлы — единый бренд-стиль bess1lie (апрувами контента за май-июль 2026).

## Бренд-токены
- Светлый фон `#FAF9F6`, тёмный `#0F172A`
- Акцент `#4F46E5`, текст `#1C1917` / `#F8FAFC`, мьют `#94A3B8`
- Фрейм браузера `#0B0F19`, рамка `#E7E5E4`
- Шрифт display: **Unbounded** (800/700), body: **Manrope** (500/600/700)
- Знак: оригинальный `mark-dark-512.png` (монохром) — белая версия для тёмных фонов, тёмная для светлых
- Отступы от краёв ≥ 80px, без градиентов/теней, индикаторы `01 / N` внизу справа

## Файлы

### IG Highlights (1080×1920) — 25 шт
| Папка | Файлы | Назначение |
|---|---|---|
| `ig-highlights/cases/` | slide-01-cover … slide-05-cta | Хайлайт «Кейсы»; cover + 3 скриншота + CTA |
| `ig-highlights/services/` | slide-01-cover … slide-05-cta | Хайлайт «Услуги»; cover + landing/corporate/bot + CTA |
| `ig-highlights/bots/` | slide-01-cover, slide-02-how, slide-03-cta | Хайлайт «Боты» |
| `ig-highlights/process/` | slide-01-cover … slide-06-launch | Хайлайт «Процесс», 6 этапов |
| `ig-highlights/faq/` | slide-01-cover … slide-05-support | Хайлайт «FAQ», 5 вопросов |
| `ig-highlights/reviews/` | slide-01-soon | Хайлайт «Отзывы» (скоро) |

### IG Posts — 26 шт
| Файлы | Размер | Назначение |
|---|---|---|
| `ig-posts/reel-cover.png` | 1080×1920 | Обложка Reels |
| `ig-posts/post-errors.png` | 1080×1350 | Пост «Ошибки при выборе исполнителя» |
| `ig-posts/post-checklist.png` | 1080×1080 | Пост-чеклист |
| `ig-posts/post-personal.png` | 1080×1080 | Пост обо мне |
| `ig-posts/post-process.png` | 1080×1080 | Пост о процессе |
| `ig-posts/pricing-slide-01…04.png` | 1080×1350 | Карусель тарифов |
| `ig-posts/case-cafe-slide-01…06.png` | 1080×1350 | Кейс кафе (карусель) |
| `ig-posts/case-barber-slide-01…06.png` | 1080×1350 | Кейс барбершопа (карусель) |
| `ig-posts/case-furniture-slide-01…05.png` | 1080×1350 | Кейс мебельного (карусель) |

### TG Channel — 10 шт
| Файлы | Размер | Назначение |
|---|---|---|
| `tg-channel/covers/cover-*.png` (5 шт) | 1280×720 | Обложки постов канала |
| `tg-channel/templates/template-*.png` (5 шт) | 1080×1080 | Шаблоны-обложки типовых постов |

### Сервисное
| Файл | Размер | Назначение |
|---|---|---|
| `preview-grid.png` | 1120×3186 | Все изображения в сетке с подписями |

## Итого
- **61** контент-файл (25 highlights + 26 IG posts + 10 TG) + **preview-grid.png**
- Логотипы: `light2-512.png`, `light2-256.png` (белый знак), `dark2-512.png` (оригинал)

## Как перегенерировать
```bash
cd /tmp/branding/content
node gen.js      # все 61 файл + логотипы (заново)
node preview.js  # preview-grid.png
```

## Ссылки (используются в контенте)
- Бот заявок: `@bess1liebot` — тг-канал: `@bess1lie` — личный: `@bessiliehh` — сайт: bess1lie.github.io