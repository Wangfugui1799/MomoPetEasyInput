import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from dotenv import dotenv_values

spec = importlib.util.spec_from_file_location('configure_voice', Path(__file__).resolve().parents[2] / 'scripts/configure-voice.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='momo installer ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / '.env.example').write_text('MOMO_LLM_API_KEY=replace-with-your-own-api-key\nMOMO_LLM_MODEL=deepseek-chat\n')
        (self.root / 'conf.example.yaml').write_text('persona: example\n')

    def test_missing_key_is_incomplete_and_files_are_private(self):
        self.assertEqual(installer.configure(self.root, False), 2)
        self.assertEqual(os.stat(self.root / '.env').st_mode & 0o777, 0o600)
        self.assertEqual(os.stat(self.root / 'conf.yaml').st_mode & 0o777, 0o600)

    def test_rerun_preserves_existing_key_and_persona_exactly(self):
        env = b'# custom\nMOMO_LLM_API_KEY=test-only-secret\n'
        persona = b'persona: custom\n'
        (self.root / '.env').write_bytes(env)
        (self.root / 'conf.yaml').write_bytes(persona)
        self.assertEqual(installer.configure(self.root, False), 0)
        self.assertEqual((self.root / '.env').read_bytes(), env)
        self.assertEqual((self.root / 'conf.yaml').read_bytes(), persona)

    def test_interactive_key_quotes_roundtrip(self):
        key = "test-only-'quoted-key"
        with patch('sys.stdin.isatty', return_value=True), patch.object(installer.getpass, 'getpass', return_value=key), patch('builtins.input', side_effect=['https://example.com/v1', 'custom-model']):
            self.assertEqual(installer.configure(self.root), 0)
        values = dotenv_values(self.root / '.env')
        self.assertEqual(values['MOMO_LLM_API_KEY'], key)
        self.assertEqual(values['MOMO_LLM_MODEL'], 'custom-model')

    def test_invalid_endpoint_does_not_save_key(self):
        with patch('sys.stdin.isatty', return_value=True), patch.object(installer.getpass, 'getpass', return_value='test-only'), patch('builtins.input', side_effect=['https://example.com/v1/chat/completions', 'model']):
            self.assertEqual(installer.configure(self.root), 2)
        self.assertEqual(dotenv_values(self.root / '.env')['MOMO_LLM_API_KEY'], 'replace-with-your-own-api-key')
