"""Готовит панорамы 3D-тура для сайта.

    pip install Pillow
    python3 make_panorama_variants.py

Для каждого исходника в source-assets/panoramas/ (PNG, JPEG или TIFF,
эквидистантная проекция 2:1) создаёт в static/assets/:

  <имя>.jpg          — полный файл: JPEG q92 без прореживания цвета, не шире
                       8192 px; используется в режиме VR и если тайлов нет;
  <имя>-preview.jpg  — превью 1024×512 (~70–80 КБ): показывается сразу и служит
                       миниатюрой сцены;
  tour-tiles/<имя>-<хэш>/<уровень>/<столбец>_<строка>.jpg — тайлы для
                       Photo Sphere Viewer: браузер загружает только видимые
                       фрагменты нужной детализации. Уровни — 2048, 4096, 8192 px
                       (не больше ширины исходника), тайл около 512 px.
                       Хэш в имени папки меняется вместе с содержимым, поэтому
                       кэш браузера и сервера не покажет старые тайлы.

Исходники в source-assets/ на сайт не попадают. После запуска укажите
<имя>.jpg в TOUR_PANORAMAS (build_pages.py) и пересоберите сайт.
"""
from pathlib import Path
import hashlib
import json
import shutil
import sys

try:
    from PIL import Image
except ImportError:
    raise SystemExit('Нужна библиотека Pillow: pip install Pillow')

PROJECT = Path(__file__).resolve().parent
SOURCE = PROJECT / 'source-assets' / 'panoramas'
TARGET = PROJECT / 'static' / 'assets'
TILES = TARGET / 'tour-tiles'
MAX_WIDTH = 8192
PREVIEW_WIDTH = 1024
TILE = 512


def save_jpeg(image, path, quality, width, subsampling):
    if image.width > width:
        image = image.resize((width, width // 2), Image.LANCZOS)
    image.save(path, 'JPEG', quality=quality, subsampling=subsampling, optimize=True, progressive=True)
    return path.stat().st_size


def tile_levels(width):
    """Уровни детализации: 2048, 4096, 8192 px, но не шире исходника.
    Число столбцов — степень двойки (требование Photo Sphere Viewer), строк вдвое меньше."""
    widths = [w for w in (2048, 4096, 8192) if w < width] + [min(width, MAX_WIDTH)]
    levels = []
    for w in widths:
        needed = -(-w // TILE)  # сколько тайлов по ~512 px нужно по ширине
        cols = max(2, 1 << (needed - 1).bit_length())  # ближайшая степень двойки не меньше needed
        w -= w % cols
        levels.append({'width': w, 'cols': cols, 'rows': max(1, cols // 2)})
    return levels


def make_tiles(image, stem, digest):
    for old in TILES.glob(f'{stem}-*'):
        if old.is_dir():
            shutil.rmtree(old)
    folder = TILES / f'{stem}-{digest}'
    levels = tile_levels(image.width)
    count = 0
    for index, level in enumerate(levels):
        scaled = image if level['width'] == image.width else image.resize((level['width'], level['width'] // 2), Image.LANCZOS)
        size = level['width'] // level['cols']
        (folder / str(index)).mkdir(parents=True, exist_ok=True)
        for col in range(level['cols']):
            for row in range(level['rows']):
                tile = scaled.crop((col * size, row * size, (col + 1) * size, (row + 1) * size))
                tile.save(folder / str(index) / f'{col}_{row}.jpg', 'JPEG', quality=90, subsampling=0, optimize=True)
                count += 1
    (folder / 'tiles.json').write_text(json.dumps({'levels': levels}), encoding='utf-8')
    return folder, levels, count


def main():
    sources = sorted(p for p in SOURCE.glob('*') if p.suffix.lower() in {'.png', '.jpg', '.jpeg', '.tif', '.tiff'})
    if not sources:
        raise SystemExit(f'Нет исходников в {SOURCE}')
    TARGET.mkdir(parents=True, exist_ok=True)
    for source in sources:
        image = Image.open(source).convert('RGB')
        ratio = image.width / image.height
        if abs(ratio - 2) > 0.02:
            print(f'ВНИМАНИЕ: {source.name} — соотношение {ratio:.3f}, для панорамы нужно 2:1', file=sys.stderr)
        if image.width > MAX_WIDTH:
            image = image.resize((MAX_WIDTH, MAX_WIDTH // 2), Image.LANCZOS)
        full = save_jpeg(image, TARGET / f'{source.stem}.jpg', 92, MAX_WIDTH, 0)
        preview = save_jpeg(image, TARGET / f'{source.stem}-preview.jpg', 70, PREVIEW_WIDTH, 2)
        digest = hashlib.sha256((TARGET / f'{source.stem}.jpg').read_bytes()).hexdigest()[:10]
        folder, levels, count = make_tiles(image, source.stem, digest)
        print(f'{source.name}: {image.width}×{image.height} → {source.stem}.jpg {full // 1024} КБ, превью {preview // 1024} КБ, '
              f'тайлов {count} ({", ".join(str(l["width"]) for l in levels)} px) в {folder.relative_to(PROJECT)}')


if __name__ == '__main__':
    main()
