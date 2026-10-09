"""Сверка опубликованного сайта с папкой dist.

    python3 check_deploy.py http://dexaur9j.beget.tech

Для каждого файла из dist скачивает одноимённый файл с сервера и сравнивает
содержимое: SAME — совпадает, DIFF — на сервере другая версия, MISSING — файла
нет. Служебные файлы (.htaccess, .nojekyll) не проверяются.
Код выхода 1, если есть DIFF или MISSING.
"""
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import sys

DIST = Path(__file__).resolve().parent / 'dist'


def fetch(url):
    try:
        with urlopen(Request(url, headers={'Cache-Control': 'no-cache'}), timeout=30) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, b''
    except URLError as error:
        return f'error: {error.reason}', b''


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 check_deploy.py http://your-domain')
    base = sys.argv[1].rstrip('/')
    if not DIST.is_dir():
        raise SystemExit('dist not found: run python3 build_pages.py first')
    problems = 0
    # Служебные файлы (.htaccess, .nojekyll) серверы посетителям не отдают.
    for path in sorted(p for p in DIST.rglob('*') if p.is_file() and not p.name.startswith('.')):
        rel = path.relative_to(DIST).as_posix()
        status, body = fetch(f'{base}/{rel}')
        if status != 200:
            state = 'MISSING'
        elif body == path.read_bytes():
            state = 'SAME'
        else:
            state = 'DIFF'
        problems += state != 'SAME'
        print(f'{state:8} {status} {rel}')
    print('\nВсе файлы совпадают с dist.' if not problems else
          f'\nНе совпадает файлов: {problems}. Загрузите содержимое dist в public_html полностью, с заменой файлов и папок.')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
