import asyncio
import hashlib
import io
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import download_model as model
import run_momo


class ModelTests(unittest.TestCase):
    def archive(self, root, entries):
        archive = root / 'model.tar.bz2'
        with tarfile.open(archive, 'w:bz2') as tar:
            for name, data, symlink in entries:
                member = tarfile.TarInfo(name)
                if symlink:
                    member.type = tarfile.SYMTYPE
                    member.linkname = '/tmp/should-not-extract'
                else:
                    member.size = len(data)
                tar.addfile(member, None if symlink else io.BytesIO(data))
        return archive

    def test_verified_archive_ignores_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            staging = root / 'staging'
            staging.mkdir()
            archive = self.archive(root, [(model.MODEL_DIR + '/tokens.txt', b'ok', False), ('../escape', b'bad', False)])
            with patch.object(model, 'HASHES', {'tokens.txt': hashlib.sha256(b'ok').hexdigest()}):
                model.extract_verified(archive, staging)
            self.assertEqual((staging / 'tokens.txt').read_bytes(), b'ok')
            self.assertFalse((root / 'escape').exists())

    def test_rejects_hash_mismatch_and_links(self):
        for data, symlink in [(b'wrong', False), (b'', True)]:
            with self.subTest(symlink=symlink), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                archive = self.archive(root, [(model.MODEL_DIR + '/tokens.txt', data, symlink)])
                with patch.object(model, 'HASHES', {'tokens.txt': hashlib.sha256(b'ok').hexdigest()}):
                    with self.assertRaises(ValueError):
                        model.extract_verified(archive, root)

    def test_rejects_missing_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = self.archive(root, [])
            with self.assertRaises(ValueError):
                model.extract_verified(archive, root)

    def test_cached_model_never_downloads(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / model.MODEL_DIR
            target.mkdir()
            (target / 'tokens.txt').write_bytes(b'ok')
            with patch.object(model, 'HASHES', {'tokens.txt': hashlib.sha256(b'ok').hexdigest()}), patch('requests.get') as get:
                self.assertEqual(model.ensure_model(root), target)
                get.assert_not_called()


class ConfigurationTests(unittest.TestCase):
    def check(self, key, host='127.0.0.1'):
        original = Path.cwd()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            template = (run_momo.ROOT / 'conf.example.yaml').read_text().replace("host: '127.0.0.1'", "host: '" + host + "'")
            (root / 'conf.example.yaml').write_text(template)
            try:
                with patch.object(run_momo, 'ROOT', root), patch.dict(os.environ, {'MOMO_LLM_API_KEY': key}, clear=True), patch('shutil.which', return_value='/test/ffmpeg'):
                    return run_momo.prepare_config()
            finally:
                os.chdir(original)

    def test_quotes_in_secret_are_literal(self):
        key = "test-only-'quoted\"-value"
        config = self.check(key)
        self.assertEqual(config.character_config.agent_config.llm_configs.openai_compatible_llm.llm_api_key, key)

    def test_requires_real_configuration(self):
        for key in ['', 'replace-with-your-own-api-key']:
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.check(key)

    def test_forbids_public_bind(self):
        with self.assertRaisesRegex(ValueError, '127.0.0.1'):
            self.check('test-only-key', '0.0.0.0')


class OriginTests(unittest.IsolatedAsyncioTestCase):
    async def test_origin_filter(self):
        for origin, allowed in [(None, True), ('http://127.0.0.1:4784', True), ('http://localhost:4783', True), ('https://evil.example', False), ('http://localhost.evil.example', False), ('null', False)]:
            calls, messages = [], []
            async def app(*args): calls.append(True)
            async def send(message): messages.append(message)
            scope = {'type': 'websocket', 'headers': [] if origin is None else [(b'origin', origin.encode())]}
            await run_momo.LocalWebSocketOrigins(app)(scope, None, send)
            self.assertEqual(bool(calls), allowed, origin)
            if not allowed: self.assertEqual(messages[0]['code'], 1008)
