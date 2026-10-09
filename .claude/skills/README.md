# Скиллы для разработки сайта РССМП

Скилл — это методичка в формате `SKILL.md`: когда применять, правила, примеры. Перед задачей откройте подходящий `SKILL.md` и следуйте ему. Если совет скилла противоречит правилам проекта (`02_ПЕРЕДАЧА_ПРОЕКТА.md`, раздел 6), правила проекта важнее.

| Задача | Скилл |
|---|---|
| внешний вид, новый раздел | `frontend-design` |
| проверка интерфейса и доступности | `web-design-guidelines`, `accessibility` |
| общий аудит сайта | `web-quality-audit` (скрипт `scripts/analyze.sh`, нужен `jq`) |
| скорость, изображения, LCP/CLS/INP | `performance`, `core-web-vitals` |
| SEO, sitemap, schema.org | `seo` |
| безопасность, CSP, заголовки | `best-practices` |
| тесты Playwright | `playwright-best-practices`, `webapp-testing` |
| поиск новых скиллов | `find-skills` (нужны интернет и `npx`) |
| доработка готового интерфейса | `better-ui`, `better-typography`, `better-colors`, `better-layout`, `better-accessibility`, `better-writing`; общий обзор — `better-interface` |
| палитра, шрифты, правила UX | `ui-ux-pro-max`: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<запрос>" --domain ux` |
| анимация и жесты | `animate`, `emil-design-eng`, `apple-design`; аудит — `improve-animations`, `find-animation-opportunities` |
| сайт на телефоне | `mobile-native` |
| описание дизайн-системы (`DESIGN.md`) | `create-design-md` |
| только по прямой команде | `interface-review`, `review-animations`, `variant`, `break`, `explain-interface` |

Все скиллы скопированы из исходных репозиториев без изменений и проверены до установки. Источники, коммиты, лицензии (MIT, Apache-2.0) и отклонённые скиллы описаны в `SOURCES.md`. В `SOURCES.md` упомянуты и скиллы для React и Supabase: они для другого проекта (Telegram Mini App), поэтому в этот пакет не включены.

Правила проекта, о которых скиллы не знают:
- без CDN и внешних шрифтов, хотя в `performance` и `seo` есть примеры с Google Fonts;
- индексация закрыта до утверждения станцией;
- стиль официальный и спокойный, хотя `frontend-design` призывает к смелому дизайну;
- без стекла и полупрозрачных панелей, хотя `apple-design` их советует;
- `ui-ux-pro-max` предлагает Google Fonts через `@import` — только свои шрифты;
- правила о кавычках и формулировках в `better-typography` и `better-writing` написаны для английского: в русских текстах «ёлочки».
