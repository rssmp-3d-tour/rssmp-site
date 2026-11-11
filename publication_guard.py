"""Fail closed when private or unexpected files enter the public asset tree."""
from pathlib import Path


def validate_site_size(root, limit=1_000_000_000):
    """Stay below the published GitHub Pages site size limit."""
    size = sum(p.stat().st_size for p in Path(root).rglob('*') if p.is_file())
    if size > limit:
        raise ValueError(f'Published site exceeds size budget: {size} > {limit} bytes')
    return size


def validate_public_assets(root):
    root = Path(root)
    if root.is_symlink():
        raise ValueError('Public asset root cannot be a symlink')
    fixed = {'app.js', 'tour-viewer.js', 'style.css', 'vendor/psv.js',
             'vendor/psv.css', 'vendor/LICENSES.txt'}
    image_types = {'.jpg', '.jpeg', '.png', '.webp', '.svg', '.avif', '.ico'}
    for path in root.rglob('*'):
        rel = path.relative_to(root)
        name = rel.as_posix()
        if path.is_symlink():
            raise ValueError(f'Symlink cannot be published: {name}')
        if any(part.startswith('.') for part in rel.parts):
            raise ValueError(f'Hidden path cannot be published: {name}')
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError(f'Unsupported public asset: {name}')
        if name in fixed:
            continue
        if rel.parts[0] == 'assets' and path.suffix.lower() in image_types:
            continue
        if (len(rel.parts) == 4 and rel.parts[:2] == ('assets', 'tour-tiles')
                and rel.name == 'tiles.json'):
            continue
        raise ValueError(f'Unexpected file in public assets: {name}')
