"""Regression checks for accidental publication, without real private data."""
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from publication_guard import validate_public_assets, validate_site_size


class PublicationGuardTest(unittest.TestCase):
    def test_site_size_budget_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'asset').write_bytes(b'12345678')
            self.assertEqual(validate_site_size(directory, limit=8), 8)
            with self.assertRaises(ValueError):
                validate_site_size(directory, limit=7)

    def test_current_public_assets(self):
        validate_public_assets(Path(__file__).resolve().parents[1] / 'static')

    def test_private_files_rejected(self):
        for name in ('backup.zip', 'assets/patients.json', 'assets/store.sqlite',
                     'assets/notes.txt', '.env', '.git/config',
                     'assets/.backup/photo.jpg', 'assets/app.js.map',
                     'assets/leaked.key', 'assets/README.md'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                p = Path(directory) / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text('synthetic fixture')
                with self.assertRaises(ValueError):
                    validate_public_assets(directory)

    def test_symlink_file_and_directory_rejected(self):
        for directory_link in (False, True):
            with self.subTest(directory_link=directory_link), tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / 'static'
                root.mkdir()
                target = Path(directory) / 'outside'
                if directory_link:
                    target.mkdir()
                else:
                    target.write_text('synthetic fixture')
                (root / 'assets').symlink_to(target, target_is_directory=directory_link)
                with self.assertRaises(ValueError):
                    validate_public_assets(root)


if __name__ == '__main__':
    unittest.main()
