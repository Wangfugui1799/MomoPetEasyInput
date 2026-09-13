"""Session-local Momo voice/persona choices. Never modify shared engines or disk config."""
VOICES = {'zh-TW-HsiaoChenNeural', 'zh-CN-XiaoxiaoNeural',
          'zh-CN-XiaoyiNeural', 'zh-CN-YunxiNeural'}
PERSONAS = {
    'gentle': '你是 Momo，温柔耐心的陪伴宠物。认真倾听用户，先理解感受，再给出贴心而具体的回应。',
    'playful': '你是 Momo，活泼开朗的元气搭子。用轻松俏皮的话陪用户聊天，鼓励探索日常的小乐趣，不嘲笑或贬低用户。',
    'calm': '你是 Momo，沉稳可靠的助手型宠物。表达简洁直接，帮助用户梳理问题，给出清楚可行的建议。',
}
RULES = '用一到三句简短中文回答，适合朗读，不使用 Markdown、表情标签或括号动作。不假装控制了硬件或记得未提供的对话。'


async def apply_profile(context, data):
    voice, persona = data.get('voice', 'default'), data.get('persona', 'default')
    if not isinstance(voice, str) or not isinstance(persona, str):
        raise ValueError('Invalid profile')
    if voice != 'default' and voice not in VOICES:
        raise ValueError('Unknown voice')
    if persona != 'default' and persona not in PERSONAS:
        raise ValueError('Unknown persona')
    # Validate both choices before changing any session state.
    if voice != 'default':
        from .config_manager import TTSConfig
        config = TTSConfig.model_validate({'tts_model': 'edge_tts', 'edge_tts': {'voice': voice}})
        context.init_tts(config)
    if persona != 'default':
        prompt = PERSONAS[persona] + RULES
        await context.init_agent(context.character_config.agent_config, prompt)
        context.character_config.persona_prompt = prompt
