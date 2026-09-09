"""Momo's local-only voice entrypoint; does not launch the upstream Live2D UI."""
import argparse
from contextlib import asynccontextmanager
import os
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent


def prepare_config():
    from dotenv import load_dotenv
    import yaml
    from src.open_llm_vtuber.config_manager import Config

    os.chdir(ROOT)
    load_dotenv(ROOT / '.env')
    if not (ROOT / 'conf.yaml').exists():
        shutil.copyfile(ROOT / 'conf.example.yaml', ROOT / 'conf.yaml')
        print('已创建 voice-server/conf.yaml。', flush=True)
    # Parse before substituting variables so quotes in credentials stay literal.
    data = yaml.safe_load((ROOT / 'conf.yaml').read_text(encoding='utf-8'))
    values = {
        'MOMO_LLM_API_KEY': os.getenv('MOMO_LLM_API_KEY', ''),
        'MOMO_LLM_BASE_URL': os.getenv('MOMO_LLM_BASE_URL', 'https://api.deepseek.com'),
        'MOMO_LLM_MODEL': os.getenv('MOMO_LLM_MODEL', 'deepseek-chat'),
    }
    def expand(obj):
        if isinstance(obj, dict):
            return {k: expand(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [expand(v) for v in obj]
        if isinstance(obj, str):
            for key, value in values.items():
                obj = obj.replace('${' + key + '}', value)
        return obj
    config = Config.model_validate(expand(data))
    if config.system_config.host != '127.0.0.1':
        raise ValueError('此启动入口仅支持 host: 127.0.0.1，不能直接部署到公网。')
    agent = config.character_config.agent_config
    key = agent.llm_configs.openai_compatible_llm.llm_api_key
    if not key or key == 'replace-with-your-own-api-key' or '${' in key:
        raise ValueError('请复制 .env.example 为 .env，并填写 MOMO_LLM_API_KEY。')
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise ValueError('未找到 FFmpeg / ffprobe，请先安装并加入 PATH。')
    for directory in ('cache', 'logs', 'models', 'characters', 'chat_history'):
        (ROOT / directory).mkdir(exist_ok=True)
    return config


class LocalWebSocketOrigins:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'websocket':
            from urllib.parse import urlparse
            origin = dict(scope.get('headers', [])).get(b'origin')
            if origin:
                parsed = urlparse(origin.decode('ascii', errors='replace'))
                if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost'):
                    await send({'type': 'websocket.close', 'code': 1008})
                    return
        await self.app(scope, receive, send)


def make_app(config):
    from fastapi import FastAPI
    from src.open_llm_vtuber.service_context import ServiceContext
    from src.open_llm_vtuber.routes import init_client_ws_route

    context = ServiceContext()

    @asynccontextmanager
    async def lifespan(app):
        from download_model import ensure_model, MODEL_DIR
        model = config.character_config.asr_config.sherpa_onnx_asr.sense_voice
        if model == "./models/" + MODEL_DIR + "/model.int8.onnx":
            import asyncio
            await asyncio.to_thread(ensure_model)
        await context.load_from_config(config)
        print('MOMO_VOICE_READY：http://127.0.0.1:' + str(config.system_config.port), flush=True)
        yield

    app = FastAPI(title='Momo Voice Server', lifespan=lifespan)
    app.add_middleware(LocalWebSocketOrigins)
    app.include_router(init_client_ws_route(default_context_cache=context))

    @app.get('/health')
    async def health():
        return {'status': 'ready', 'service': 'momo-voice', 'version': '0.5.0'}

    return app


def main():
    parser = argparse.ArgumentParser(description='Momo 本地语音服务')
    parser.add_argument('--check', action='store_true', help='仅检查配置、依赖和模型状态')
    parser.add_argument('--port', type=int, help='测试用端口；Momo 默认连接 12393')
    args = parser.parse_args()
    from loguru import logger
    logger.remove()
    logger.add(sys.stderr, level='INFO', backtrace=False, diagnose=False)
    try:
        config = prepare_config()
        if args.port:
            config.system_config.port = args.port
        app = make_app(config)
    except Exception as error:
        # ValidationError contains input values, so never print it with credentials.
        if isinstance(error, ValueError) and type(error) is ValueError:
            print(str(error), file=sys.stderr)
        else:
            print('配置或依赖检查失败：' + type(error).__name__ + '。请核对配置模板并运行 uv sync --locked。', file=sys.stderr)
        return 2
    if args.check:
        model = ROOT / 'models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/model.int8.onnx'
        print('配置、依赖、FFmpeg 检查通过。模型：' + ('已安装' if model.exists() else '首次启动将下载'))
        return 0
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=config.system_config.port, log_level='info')
    return 0


if __name__ == '__main__':
    sys.exit(main())
