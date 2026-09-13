import sys
from pathlib import Path
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.open_llm_vtuber.momo_profile import apply_profile, PERSONAS


class ProfileTests(unittest.IsolatedAsyncioTestCase):
    def context(self):
        return SimpleNamespace(init_tts=Mock(), init_agent=AsyncMock(),
            character_config=SimpleNamespace(agent_config=object(), persona_prompt='original'))

    async def test_defaults_preserve_config(self):
        c = self.context()
        await apply_profile(c, {})
        c.init_tts.assert_not_called()
        c.init_agent.assert_not_called()
        self.assertEqual(c.character_config.persona_prompt, 'original')

    async def test_persona_applies_to_session_only(self):
        c, other = self.context(), self.context()
        await apply_profile(c, {'persona': 'gentle'})
        self.assertTrue(c.character_config.persona_prompt.startswith(PERSONAS['gentle']))
        c.init_agent.assert_awaited_once()
        self.assertEqual(other.character_config.persona_prompt, 'original')

    async def test_invalid_choices_do_not_mutate(self):
        for data in [{'voice': 'unknown'}, {'persona': []}, {'voice': 'zh-CN-YunxiNeural', 'persona': 'unknown'}]:
            c = self.context()
            with self.assertRaises(ValueError):
                await apply_profile(c, data)
            c.init_tts.assert_not_called()
            c.init_agent.assert_not_called()

    async def test_voice_config(self):
        c = self.context()
        await apply_profile(c, {'voice': 'zh-CN-YunxiNeural'})
        config = c.init_tts.call_args.args[0]
        self.assertEqual(config.tts_model, 'edge_tts')
        self.assertEqual(config.edge_tts.voice, 'zh-CN-YunxiNeural')
