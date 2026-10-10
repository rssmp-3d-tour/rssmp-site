"""Генератор сайта РССМП.

Исходники: shell.html, home.html, этот файл (тексты страниц) и папка static/.
Результат: папка dist/, которая каждый раз создаётся заново и целиком
загружается в public_html. Файлы в dist/ вручную не редактируются.

Демонстрационная сборка (закрыта от индексации):
    python3 build_pages.py
Публичная сборка:
    RSSMP_PUBLIC=1 RSSMP_BASE_URL=https://домен python3 build_pages.py
Сборка для GitHub Pages (без .htaccess, с файлом .nojekyll):
    RSSMP_TARGET=github python3 build_pages.py
"""
from datetime import date
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import os
import re
import shutil

PROJECT = Path(__file__).resolve().parent
STATIC = PROJECT / 'static'
ROOT = PROJECT / 'dist'
PUBLIC = os.environ.get('RSSMP_PUBLIC') == '1'
TARGET = os.environ.get('RSSMP_TARGET', 'beget')
if TARGET not in ('beget', 'github'):
    raise SystemExit('RSSMP_TARGET must be beget or github')
BASE_URL = os.environ.get('RSSMP_BASE_URL', '').rstrip('/')
if PUBLIC and not BASE_URL:
    raise SystemExit('For a public build set RSSMP_BASE_URL, for example https://rssmp.ru')


def read(path):
    return path.read_text(encoding='utf-8')


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8', newline='\n')


nav = [('/', 'Главная'), ('/about/', 'О станции'), ('/patients/', 'Пациентам'), ('/news/', 'Новости'),
       ('/tours/', '3D-туры'), ('/gallery/', 'Галерея'), ('/contacts/', 'Контакты')]
DEFAULT_DESCRIPTION = ('Республиканская станция скорой медицинской помощи Чеченской Республики: информация для пациентов, '
                       'новости, 3D-туры и контакты. Вызов скорой помощи — 103.')


def shell(title, body, route='/', description=DEFAULT_DESCRIPTION, robots=None, canonical=True):
    links = ''.join(f'<a href="{u}"' + (' class="active" aria-current="page"' if u == route else '') + f'>{t}</a>'
                    for u, t in nav)
    canonical_tag = f'<link rel="canonical" href="{escape(BASE_URL + route)}">' if BASE_URL and canonical else ''
    replacements = {
        '%%TITLE%%': escape(title),
        '%%DESCRIPTION%%': escape(description),
        '%%NAV%%': links,
        '%%ROBOTS%%': robots or ('index,follow' if PUBLIC else 'noindex,nofollow'),
        '%%CANONICAL%%': canonical_tag,
        '%%YEAR%%': str(date.today().year),
    }
    page = read(PROJECT / 'shell.html')
    for key, value in replacements.items():
        page = page.replace(key, value)
    return page.replace('%%BODY%%', body)


def heading(title):
    return (f'<div class="page-heading"><div class="wrap"><nav class="breadcrumbs" aria-label="Навигационная цепочка">'
            f'<a href="/">Главная</a> <span aria-hidden="true">/</span> <span aria-current="page">{title}</span></nav>'
            f'<h1>{title}</h1></div></div>')


news = [('28 августа 2026', 'Пациентам', 'Повышенное давление: в каких случаях обращаться в скорую помощь', '2934'),
        ('22 августа 2026', 'Пациентам', 'Обмороки в жаркую погоду: материал для пациентов', '2930'),
        ('22 августа 2026', 'Услуги', 'Медицинская транспортировка: информация об услуге РССМП', '2926')]


def cards(level=3):
    return '<div class="cards">' + ''.join(
        f'<article class="card" data-category="{tag}"><span class="tag">{tag.upper()}</span><time>{day}</time>'
        f'<h{level}>{title}</h{level}><a class="text-link" href="https://rssmp.ru/?post_type=post&amp;p={pid}">Читать на rssmp.ru</a></article>'
        for day, tag, title, pid in news) + '</div>'


def photo(file, alt, attrs='', sizes=None):
    """<img> с размерами и, если есть уменьшенная копия, с srcset."""
    width, height = PHOTO_SIZES[file]
    srcset = ''
    if sizes and (STATIC / 'assets' / f'{file}-800.jpg').exists():
        srcset = f' srcset="/assets/{file}-800.jpg 800w, /assets/{file}.jpg {width}w" sizes="{sizes}"'
    return f'<img{attrs} src="/assets/{file}.jpg"{srcset} width="{width}" height="{height}" alt="{alt}"'


# Панорамы 3D-тура: у каждой сцены свой файл в static/assets/. Режим тура:
# - vehicles: у классов B и C разные настоящие съёмки снаружи и в салоне —
#   выбор «Класс B / Класс C». Двор станции ('b-yard', 'c-yard') показывается
#   первой сценой, если его панорама задана у обоих классов;
# - demo: иначе (файлы B и C совпадают или демонстрационные) — один
#   демонстрационный тур без выбора класса.
# Файлы готовит make_panorama_variants.py: к каждой панораме <имя>.jpg он создаёт
# превью <имя>-preview.jpg, которое показывается сразу и служит миниатюрой сцены.
TOUR_PANORAMAS = {
    'b-yard': 'tour-b-yard.jpg',
    'b-exterior': 'tour-b-exterior.jpg',
    'b-interior': 'tour-b-interior.jpg',
    'c-yard': 'tour-c-yard.jpg',
    'c-exterior': 'tour-c-exterior.jpg',
    'c-interior': 'tour-c-interior.jpg',
}
# Оба автомобиля сняты на станции 9 октября 2026 года (BEGET.md, раздел о панорамах).
TOUR_SHOT = 'в октябре 2026 года'
DEMO_PANORAMAS = {'tour-exterior-demo.jpg', 'tour-interior-demo.jpg'}


def panorama_preview(file):
    """Адрес превью панорамы, если make_panorama_variants.py его создал."""
    preview = STATIC / 'assets' / f'{Path(file).stem}-preview.jpg'
    return f'/assets/{preview.name}' if preview.is_file() else None


def panorama_tiles(file):
    """Тайлы панорамы для Photo Sphere Viewer (make_panorama_variants.py):
    {"base": "/assets/tour-tiles/<имя>-<хэш>/", "levels": [...]} или None."""
    found = sorted((STATIC / 'assets' / 'tour-tiles').glob(f'{Path(file).stem}-*/tiles.json'))
    if not found:
        return None
    folder = found[-1].parent
    return {'base': f'/assets/tour-tiles/{folder.name}/', 'levels': json.loads(found[-1].read_text(encoding='utf-8'))['levels']}


def tour_mode():
    files = {scene: STATIC / 'assets' / name for scene, name in TOUR_PANORAMAS.items()}
    for scene, path in files.items():
        if not path.is_file():
            raise SystemExit(f'Panorama for {scene} not found: {path}')
    digest = {scene: hashlib.sha256(path.read_bytes()).hexdigest() for scene, path in files.items()}
    separate = all(digest[f'b-{view}'] != digest[f'c-{view}'] for view in ('exterior', 'interior'))
    real = not any(TOUR_PANORAMAS[f'{vehicle}-{view}'] in DEMO_PANORAMAS for vehicle in 'bc' for view in ('exterior', 'interior'))
    return 'vehicles' if separate and real else 'demo'


TOUR_MODE = tour_mode()
VIEW_LABELS = {'yard': 'Двор станции', 'exterior': 'Снаружи', 'interior': 'Салон'}
# Сцены автомобиля по порядку обхода; двор — если его панорама задана у обоих классов.
TOUR_YARD = TOUR_MODE == 'vehicles' and {'b-yard', 'c-yard'} <= TOUR_PANORAMAS.keys()
TOUR_VIEWS = (['yard'] if TOUR_YARD else []) + ['exterior', 'interior']
TOUR_SCOPE = 'двор станции, вид снаружи, медицинский салон' if TOUR_YARD else 'внешний вид и медицинский салон'
TOUR_SUMMARY = {'demo': 'Демонстрационный обзор: внешний вид и медицинский салон',
                'vehicles': f'Классы B и C: {TOUR_SCOPE}'}[TOUR_MODE]

PHOTO_SIZES = {'img_5184': (1170, 646), 'img_0072': (1290, 716), 'img_9159': (1290, 722)}

about = ('<p>Республиканская станция скорой медицинской помощи объединяет службу скорой помощи Чеченской Республики. '
         'Центральная станция находится в Грозном.</p><p>Станция действует как самостоятельное учреждение с 1 января 1991 года. '
         'В её работе используются единый диспетчерский центр, специализированные бригады и медицинское оборудование '
         'для оказания помощи пациентам.</p>')
home = (read(PROJECT / 'home.html').replace('%%CARDS%%', cards(3))
        .replace('%%TOUR_SUMMARY%%', TOUR_SUMMARY)
        .replace('%%PHOTO_0072%%', photo('img_0072', 'Практическое занятие сотрудников РССМП', ' class="photo"', '(max-width: 800px) 100vw, 50vw') + ' loading="lazy">'))

pages = {'/': ('Главная', home, DEFAULT_DESCRIPTION)}
pages['/about/'] = ('О станции', heading('О станции') + '<section class="section"><div class="wrap two-col"><div><p class="eyebrow">ГБУ «РССМП»</p><h2>Республиканская служба<br>скорой медицинской помощи</h2>' + about + '<p>С декабря 2019 года работает единый диспетчерский центр. В 2020 году началась централизация службы скорой медицинской помощи республики.</p><p class="source">Источник: <a href="https://rssmp.ru/obschie-svedeniya/">общие сведения о РССМП</a>.</p></div>' + photo('img_5184', 'Здание РССМП, сотрудники и автомобили скорой помощи', ' class="photo"') + '></div></section><section class="section gray"><div class="wrap"><h2>Информация о работе станции</h2><div class="partners"><a href="https://rssmp.ru/istoriya/">История станции</a><a href="https://rssmp.ru/vakansii/">Вакансии</a><a href="https://rssmp.ru/dokumenty/">Документы учреждения</a></div><p class="source">Разделы открываются на официальном сайте РССМП.</p></div></section>',
                    'О Республиканской станции скорой медицинской помощи: история, единый диспетчерский центр и официальные документы.')
pages['/patients/'] = ('Пациентам', heading('Как вызвать скорую помощь') + '''<section class="section"><div class="wrap reading"><div class="info-grid"><div class="info-box"><small>Скорая медицинская помощь</small><a href="tel:103">103</a><p>С городского или мобильного телефона.</p></div><div class="info-box"><small>Единый номер экстренных служб</small><a href="tel:112">112</a><p>Если требуется помощь нескольких экстренных служб.</p></div></div><h2>Что сообщить диспетчеру</h2><ol><li>Опишите, что произошло, и ответьте на вопросы диспетчера.</li><li>Назовите точный адрес: улицу, дом, квартиру, подъезд, этаж и код домофона. На улице укажите ориентиры.</li><li>Сообщите имя и возраст пациента, если они известны.</li><li>Оставьте свой номер телефона и назовите себя.</li><li>Объясните, как подъехать к месту. По возможности организуйте встречу бригады.</li></ol><p>Вызов государственной скорой медицинской помощи бесплатный.</p><p class="source">По материалам <a href="https://rssmp.ru/kak-vyzvat-skoruyu-pomosch/">памятки РССМП о вызове скорой помощи</a>.</p><h2>Дополнительная информация</h2><div class="partners"><a href="https://rssmp.ru/platnye-uslugi/">Платные услуги</a><a href="https://rssmp.ru/dokumenty-dlya-patsientov/">Документы для пациентов</a><a href="https://rssmp.ru/mail/">Интернет-приёмная</a></div></div></section>''',
                       'Как вызвать скорую помощь: номера 103 и 112 и что сообщить диспетчеру.')
pages['/news/'] = ('Новости', heading('Новости станции') + '<section class="section"><div class="wrap"><div class="news-filters" role="group" aria-label="Категории новостей"><button type="button" aria-pressed="true" data-filter="all">Все публикации</button><button type="button" aria-pressed="false" data-filter="Пациентам">Пациентам</button><button type="button" aria-pressed="false" data-filter="Услуги">Услуги</button></div><p id="filter-status" class="sr-only" aria-live="polite"></p>' + cards(2) + '<p class="source">Публикации официального сайта. <a href="https://rssmp.ru/category/news/">Перейти ко всем новостям РССМП</a></p></div></section>',
                   'Новости и материалы Республиканской станции скорой медицинской помощи.')
gallery = '<div class="gallery">'
for file, alt in [('img_5184', 'Здание станции и автомобили скорой помощи'), ('img_0072', 'Практическое занятие сотрудников РССМП'), ('img_9159', 'Обучение сотрудников станции')]:
    gallery += f'<figure><button type="button" data-photo="/assets/{file}.jpg" aria-label="Увеличить фото: {alt}">' + photo(file, alt, '', '(max-width: 800px) 100vw, 33vw') + f' loading="lazy"></button><figcaption>{alt}</figcaption></figure>'
gallery += '</div><dialog id="gallery-dialog" aria-label="Просмотр фотографии"><div class="dialog-top"><span id="gallery-count"></span><button type="button" data-close-dialog aria-label="Закрыть фотографию">×</button></div><img src="/assets/img_5184.jpg" alt="" loading="lazy"><div class="gallery-controls"><button type="button" id="photo-prev" aria-label="Предыдущая фотография">←</button><span id="photo-caption"></span><button type="button" id="photo-next" aria-label="Следующая фотография">→</button></div></dialog>'
pages['/gallery/'] = ('Галерея', heading('Галерея') + '<section class="section"><div class="wrap">' + gallery + '<p class="source">Фотографии из <a href="https://rssmp.ru/galereya/">галереи РССМП</a>.</p></div></section>',
                      'Фотографии Республиканской станции скорой медицинской помощи: здание, автомобили и обучение сотрудников.')
pages['/contacts/'] = ('Контакты', heading('Контакты') + '''<section class="section"><div class="wrap"><div class="info-grid"><div class="info-box"><small>Адрес станции</small><h2>Грозный, ул. Лермонтова, дом 1</h2><p>364068, Чеченская Республика</p><button type="button" class="copy-address" data-copy="364068, Чеченская Республика, г. Грозный, ул. Лермонтова, дом 1">Скопировать адрес</button><a class="map-link" href="https://yandex.ru/maps/?text=%D0%93%D1%80%D0%BE%D0%B7%D0%BD%D1%8B%D0%B9%20%D0%9B%D0%B5%D1%80%D0%BC%D0%BE%D0%BD%D1%82%D0%BE%D0%B2%D0%B0%201">Открыть на карте</a></div><div class="info-box"><small>Вызов бригады скорой помощи</small><a href="tel:103">103</a><p>Для срочного вызова скорой медицинской помощи.</p></div><div class="info-box"><small>Телефон горячей линии станции</small><a href="tel:+78712222124">+7 (8712) 22-21-24</a></div><div class="info-box"><small>Телефон доверия РССМП</small><a href="tel:+79389930100">+7 (938) 993-01-00</a></div><div class="info-box"><small>Электронная почта</small><a href="mailto:rssmp-95@mail.ru">rssmp-95@mail.ru</a></div><div class="info-box"><small>Горячая линия Минздрава ЧР</small><a href="tel:+79635976248">+7 (963) 597-62-48</a></div></div><p class="source">Источник: <a href="https://rssmp.ru/kontakty/">контакты РССМП</a>. <a href="https://rssmp.ru/adresa-stantsiy/">Адреса станций</a></p><a class="btn" href="https://rssmp.ru/mail/">Открыть интернет-приёмную</a></div></section>''',
                       'Адрес, телефоны и электронная почта Республиканской станции скорой медицинской помощи в Грозном.')
pages['/privacy/'] = ('Конфиденциальность', heading('Конфиденциальность') + '''<section class="section"><div class="wrap reading privacy-copy"><p class="eyebrow">Как работает этот сайт</p><h2>Минимум данных</h2><p>На сайте нет форм регистрации, личного кабинета, рекламных систем и встроенной веб-аналитики. Сайт не предназначен для передачи сведений о состоянии здоровья, вызова бригады или направления медицинских документов.</p><h2>Локальные настройки</h2><p>Настройки размера текста, контрастности и анимации сохраняются только на устройстве посетителя в хранилище браузера. Сайт не получает и не передаёт эти настройки.</p><h2>Технические журналы</h2><p>Хостинг-провайдер может автоматически фиксировать IP-адрес, дату и время запроса, адрес открытой страницы и сведения о браузере. Такие записи используются для работы и защиты сайта.</p><h2>Внешние сайты</h2><p>Ссылки на основной сайт РССМП, Госуслуги, карты и другие государственные ресурсы открывают сторонние сайты. На них действуют собственные правила обработки данных.</p><h2>Обращения граждан</h2><p>Не отправляйте медицинские сведения по адресам, не предназначенным для обращений. Для срочного вызова используйте номер <a href="tel:103">103</a>, для официального электронного обращения — <a href="https://rssmp.ru/mail/">интернет-приёмную РССМП</a>.</p></div></section>''',
                       'Какие данные обрабатывает сайт: локальные настройки, технические журналы хостинга и внешние ссылки.')
def icon(path):
    return (f'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="{path}"/></svg>')


ICONS = {
    'guide': icon('M8 5.5v13l10.5-6.5z'),
    'auto': icon('M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5'),
    'gyro': icon('M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2'),
    'presence': icon('M4 10v4h3.5L12 18V6L7.5 10H4zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10'),
    'share': icon('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'),
    'fullscreen': icon('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'),
    'plus': icon('M12 5v14M5 12h14'),
    'minus': icon('M5 12h14'),
    'close': icon('M6 6l12 12M18 6 6 18'),
    'prev': icon('M15 6l-6 6 6 6'),
    'next': icon('M9 6l6 6-6 6'),
}
# Число сцен и точек для страницы без JavaScript; tour-viewer.js пересчитывает их по данным тура.
TOUR_STATS = {'demo': (2, 11), 'vehicles': (6, 46) if TOUR_YARD else (4, 36)}


def plural(n, one, few, many):
    if n % 10 == 1 and n % 100 != 11:
        return one
    return few if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else many


def tour_page(mode):
    """Страница 3D-тура. mode = 'demo' (один демонстрационный тур) или 'vehicles' (выбор классов B и C)."""
    demo = mode == 'demo'
    views = TOUR_VIEWS
    # На страницу попадают только сцены этого режима.
    used = {scene: file for scene, file in TOUR_PANORAMAS.items() if scene.split('-')[1] in views}
    previews = {scene: panorama_preview(file) for scene, file in used.items()}
    data = ''.join(f' data-panorama-{scene}="/assets/{file}"' for scene, file in used.items())
    data += ''.join(f' data-preview-{scene}="{url}"' for scene, url in previews.items() if url)
    tiles = {scene: panorama_tiles(file) for scene, file in used.items()}
    # Тайлы используются, только если они есть у всех сцен: движок работает в одном режиме.
    if all(tiles.values()):
        data += ''.join(f' data-tiles-{scene}="{escape(json.dumps(value, separators=(",", ":")))}"' for scene, value in tiles.items())
    thumbs = {view: previews[f'b-{view}'] or f'/assets/{used[f"b-{view}"]}' for view in views}
    scenes, points = TOUR_STATS[mode]
    if demo:
        intro = ('Демонстрационный 360°-обзор автомобиля скорой помощи: внешний вид и медицинский салон. '
                 'Осмотритесь, откройте точки с описаниями или включите экскурсию.')
        selector = ''
        scene_name = 'Демонстрационная панорама · снаружи'
        disclaimer = ('<b>Раздел находится на этапе наполнения.</b> Сейчас показаны демонстрационные панорамы — это не съёмка '
                      'автомобилей станции. Отдельные туры по автомобилям классов B и C появятся после 360°-съёмки. '
                      'Описания оборудования публикуются после согласования с РССМП.')
    else:
        intro = ('Выберите автомобиль класса B или C и осмотрите '
                 + ('двор станции, автомобиль снаружи и медицинский салон. ' if TOUR_YARD else 'его снаружи и изнутри. ')
                 + 'Откройте точки с описаниями или включите экскурсию.')
        selector = ('<div class="tour-vehicle-selector" role="tablist" aria-label="Выбор автомобиля"><button type="button" role="tab" id="tour-tab-b" data-vehicle="b" aria-selected="true" aria-controls="tour-viewport"><small>Автомобиль скорой помощи</small><strong>Класс B</strong><span>Выездная бригада</span></button>'
                    '<button type="button" role="tab" id="tour-tab-c" data-vehicle="c" aria-selected="false" aria-controls="tour-viewport" tabindex="-1"><small>Реанимобиль</small><strong>Класс C</strong><span>Специализированная бригада</span></button></div>\n')
        scene_name = VIEW_LABELS['yard'] if TOUR_YARD else 'Автомобиль класса B · снаружи'
        disclaimer = (f'Панорамы сняты на станции {TOUR_SHOT}. Марки и модели автомобилей и оборудования будут указаны после подтверждения станцией. '
                      'Описания оборудования уточняются и публикуются после согласования с РССМП.')
    tabs = ''
    for i, view in enumerate(views):
        label = VIEW_LABELS[view]
        state = ' aria-selected="true"' if i == 0 else ' aria-selected="false" tabindex="-1"'
        tabs += (f'<button type="button" role="tab" id="tour-tab-{view}" data-view="{view}"{state} aria-controls="tour-viewport">'
                 f'<span class="tour-thumb"><img data-scene-thumb src="{thumbs[view]}" width="1024" height="512" alt=""></span><span><i aria-hidden="true">0{i + 1}</i>{label}</span></button>')
    facts = (f'<li><b data-stat="scenes">{scenes}</b><span data-stat-label="scenes">{plural(scenes, "панорама", "панорамы", "панорам")} 360°</span></li>'
             f'<li><b data-stat="points">{points}</b><span data-stat-label="points">{plural(points, "интерактивная точка", "интерактивные точки", "интерактивных точек")}</span></li>'
             '<li><b>VR</b><span>просмотр в гарнитуре</span></li>')
    return f'''<div class="tour-page">
<section class="tour-intro"><div class="tour-intro-row"><h1>Автомобили <em>скорой помощи</em></h1><ul class="tour-facts">{facts}</ul></div></section>
<section class="tour-stage" aria-label="Панорамный тур">
{selector}<div class="tour-viewport" id="tour-viewport" data-tour-viewer data-tour-mode="{mode}"{data} tabindex="0" role="region" aria-label="Интерактивный панорамный тур. Перемещайте изображение мышью, пальцем или клавишами со стрелками, клавиши плюс и минус меняют масштаб.">
  <div class="tour-psv" data-tour-stage aria-hidden="true"></div>
  <div class="tour-veil" aria-hidden="true"></div>
  <div class="tour-fallback" data-tour-fallback hidden><strong>Не удалось запустить 3D-графику.</strong><span>Откройте страницу в современной версии Chrome, Safari, Firefox или Edge.</span><button type="button" data-tour-retry hidden>Повторить загрузку</button></div>
  <div class="tour-loading" aria-hidden="true"><span></span><b>Загрузка панорамы</b></div>
  <p class="tour-sharpen" aria-hidden="true">Загрузка полного качества</p>
  <div class="tour-presence" aria-hidden="true"><i></i><i></i></div>
  <div class="tour-hotspots-layer" data-hotspots></div>
  <div class="tour-hud-top"><div class="tour-hud-title"><span data-scene-index>01 / {len(views):02d}</span><b data-scene-name>{scene_name}</b></div><div class="tour-hud-actions"><button type="button" data-vr hidden>Войти в VR</button><button type="button" data-share aria-label="Поделиться ссылкой на этот вид">{ICONS['share']}</button><button type="button" data-fullscreen aria-label="Открыть на весь экран">{ICONS['fullscreen']}</button></div></div>
  <div class="tour-controls" role="group" aria-label="Управление обзором">
    <button type="button" data-guide aria-pressed="false">{ICONS['guide']}<span>Экскурсия</span></button>
    <button type="button" data-auto aria-pressed="false">{ICONS['auto']}<span>Автообзор</span></button>
    <button type="button" data-gyro aria-pressed="false" hidden>{ICONS['gyro']}<span>Гироскоп</span></button>
    <button type="button" data-presence aria-pressed="false" title="Звук, световые акценты и виброотклик">{ICONS['presence']}<span>Эффект присутствия</span></button>
  </div>
  <div class="tour-zoom" role="group" aria-label="Масштаб"><button type="button" data-zoom="in" aria-label="Приблизить">{ICONS['plus']}</button><button type="button" data-zoom="out" aria-label="Отдалить">{ICONS['minus']}</button></div>
  <div class="tour-scene-tabs" role="tablist" aria-label="{"Сцены тура" if TOUR_YARD else "Вид автомобиля"}">{tabs}</div>
  <p class="tour-drag-hint">Мышь — перетащить · телефон — двумя пальцами · масштаб — Ctrl + колесо</p>
  <article class="tour-info-card" data-tour-card hidden tabindex="-1" aria-labelledby="tour-card-title"><div class="tour-card-head"><small data-card-index>Интерактивная точка</small><button type="button" data-card-close aria-label="Закрыть описание">{ICONS['close']}</button></div><h2 id="tour-card-title" data-card-title>Описание точки</h2><p data-card-text></p><div class="tour-card-actions"><button type="button" data-card-speak>Озвучить</button><button type="button" data-card-action></button><span class="tour-card-nav"><button type="button" data-card-prev aria-label="Предыдущая точка">{ICONS['prev']}</button><button type="button" data-card-next aria-label="Следующая точка">{ICONS['next']}</button></span></div><span class="tour-guide-timer" aria-hidden="true"><i></i></span></article>
  <p class="tour-vr-status" data-vr-status aria-live="polite"></p>
  <p class="sr-only" data-tour-announce aria-live="polite"></p>
</div>
<section class="tour-points" aria-labelledby="tour-points-title"><h2 id="tour-points-title">Точки на этой сцене</h2><ul data-hotspot-list></ul></section>
</section>
<section class="tour-about" aria-labelledby="tour-about-title"><div class="wrap"><div class="tour-about-head"><h2 id="tour-about-title">О туре</h2><p class="tour-lead">{intro}</p></div><div class="tour-about-grid"><div><h3>Управление</h3><p>На компьютере перетаскивайте панораму мышью; масштаб меняйте с Ctrl и колесом, кнопками «+» и «−» или клавиатурой. На телефоне страница прокручивается одним пальцем, панорама перемещается двумя.</p></div><div><h3>Возможности</h3><p>Экскурсия по точкам с описаниями, автообзор, ссылка на выбранный вид, просмотр в VR-гарнитуре и эффект присутствия: синтезированный звук, световые акценты и виброотклик.</p></div><div><h3>Совместимость</h3><p>Телефоны, планшеты и компьютеры. Гироскоп и вибрация работают на поддерживаемых мобильных устройствах, VR — в совместимой гарнитуре при открытии сайта по HTTPS.</p></div></div>
<p class="tour-disclaimer">{disclaimer}</p></div></section>
</div><link rel="stylesheet" href="/vendor/psv.css"><script src="/vendor/psv.js" defer></script><script src="/tour-viewer.js" defer></script>'''


TOUR_DESCRIPTIONS = {
    'demo': 'Демонстрационный 360°-обзор автомобиля скорой помощи: внешний вид и медицинский салон.',
    'vehicles': f'Интерактивный 360°-обзор автомобилей скорой помощи классов B и C: {TOUR_SCOPE}.',
}
pages['/tours/'] = ('3D-туры', tour_page(TOUR_MODE), TOUR_DESCRIPTIONS[TOUR_MODE])

not_found = heading('Страница не найдена') + '''<section class="section"><div class="wrap reading error-page"><p class="error-code" aria-hidden="true">404</p><h2>Такой страницы нет</h2><p>Возможно, адрес изменился или был введён с ошибкой.</p><div class="error-actions"><a class="btn" href="/">Перейти на главную</a><a class="text-link" href="/tours/">Открыть 3D-туры</a></div></div></section>'''


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def short_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


ASSET_RE = re.compile(r'(/assets/[\w./-]+?\.(?:png|jpe?g|webp|avif|svg|gif))(?![\w?])')


def version_assets(text):
    """Добавляет ?v=<хэш содержимого> к ссылкам на /assets/. На Beget статические
    файлы отдаёт nginx с кэшем на 7 дней, поэтому новая версия файла должна иметь новый URL."""
    def repl(match):
        asset = ROOT / match.group(1).lstrip('/')
        if not asset.is_file():
            raise SystemExit(f'Missing asset referenced by the site: {match.group(1)}')
        return f'{match.group(1)}?v={short_hash(asset)}'
    return ASSET_RE.sub(repl, text)


# 1. Чистая папка dist из static/
if ROOT.exists():
    shutil.rmtree(ROOT)
shutil.copytree(STATIC, ROOT)
# 2. Версии изображений внутри JS/CSS, затем версии самих JS/CSS
for name in ('style.css', 'app.js', 'tour-viewer.js'):
    write(ROOT / name, version_assets(read(ROOT / name)))
# vendor/ — сторонние библиотеки тура (vendor-src/build.mjs); ссылок на /assets/ в них нет.
code_versions = {name: short_hash(ROOT / name) for name in ('style.css', 'app.js', 'tour-viewer.js', 'vendor/psv.js', 'vendor/psv.css')}


def finalize(html):
    html = version_assets(html)
    for name, digest in code_versions.items():
        html = html.replace(f'"/{name}"', f'"/{name}?v={digest}"')
    return html


# 3. Поисковый индекс и страницы (app.js берёт адрес индекса из data-search-index у <html>)
index = []
for route, (title, body, description) in pages.items():
    parser = Text()
    parser.feed(body)
    index.append({'url': route, 'title': title, 'text': re.sub(r'\s+', ' ', ' '.join(parser.parts)).strip()})
write(ROOT / 'search-index.json', json.dumps(index, ensure_ascii=False))
index_version = short_hash(ROOT / 'search-index.json')
for route, (title, body, description) in pages.items():
    html = finalize(shell(title, body, route, description)).replace('"/search-index.json"', f'"/search-index.json?v={index_version}"')
    write(ROOT / route.strip('/') / 'index.html', html)
write(ROOT / '404.html', finalize(shell('Страница не найдена', not_found, '/404.html', robots='noindex,nofollow', canonical=False)))
# 4. robots, sitemap, .htaccess
if PUBLIC:
    routes = [route for route in pages if route != '/privacy/'] + ['/privacy/']
    sitemap = ''.join(f'<url><loc>{escape(BASE_URL + route)}</loc></url>' for route in routes)
    write(ROOT / 'sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + sitemap + '</urlset>')
    write(ROOT / 'robots.txt', f'User-agent: *\nAllow: /\nSitemap: {BASE_URL}/sitemap.xml\n')
else:
    write(ROOT / 'robots.txt', 'User-agent: *\nDisallow: /\n')
if TARGET == 'github':
    # GitHub Pages не читает .htaccess; политика безопасности задана тегом <meta> в shell.html.
    write(ROOT / '.nojekyll', '')
else:
    write(ROOT / '.htaccess', read(PROJECT / 'beget.htaccess'))
print(f'Created {len(pages)} pages and 404.html ({"public" if PUBLIC else "preview"} build, target: {TARGET}, tour: {TOUR_MODE}) in {ROOT}')

