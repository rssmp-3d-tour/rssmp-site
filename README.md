# Сайт РССМП с 3D-туром — исходники

Приватный репозиторий. Опубликованный демо-сайт: https://rssmp-3d-tour.github.io. В его публичный репозиторий `rssmp-3d-tour/rssmp-3d-tour.github.io` загружается только готовая сборка `dist`, а не эти исходники.

| Файл | Что внутри |
|---|---|
| `ПЕРЕДАЧА_ПРОЕКТА.md` | Состояние проекта, план, запреты, решения — **начните отсюда** |
| `AGENTS.md` | Правила для ИИ-агентов (Codex, ChatGPT, Claude) |
| `ПОДКЛЮЧЕНИЕ_GITHUB.md` | Как подключить ChatGPT и Codex, принимать изменения и публиковать |
| `AUDIT_REPORT.md` | Отчёт аудита v8 → v9.5 |
| `BEGET.md`, `GITHUB_PAGES.md` | Публикация |
| `tests/README.md` | Автоматические проверки |

```bash
python3 build_pages.py                       # сборка в dist/ (для Beget)
RSSMP_TARGET=github python3 build_pages.py   # сборка для GitHub Pages
cd tests && npm ci && npx playwright install chromium && npm test
```

На каждый pull request GitHub Actions собирает сайт и запускает все проверки.
