"""Create private voice configuration and optionally collect a key in Terminal."""
import getpass
import os
from pathlib import Path
import sys

from dotenv import dotenv_values, set_key


def configure(root, interactive=True):
    for source, target in [('.env.example', '.env'), ('conf.example.yaml', 'conf.yaml')]:
        try:
            fd = os.open(root / target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            print('已保留 voice-server/' + target)
        else:
            with os.fdopen(fd, 'wb') as output:
                output.write((root / source).read_bytes())
            print('已创建 voice-server/' + target)
    env = root / '.env'
    values = dotenv_values(env)
    key = values.get('MOMO_LLM_API_KEY')
    if key and key != 'replace-with-your-own-api-key':
        return 0
    if not interactive or not sys.stdin.isatty():
        print('请编辑 voice-server/.env 填写 MOMO_LLM_API_KEY，再重新运行安装脚本。')
        return 2
    print('填写 OpenAI 兼容 AI 服务配置。密钥输入时不会显示，直接回车可稍后填写。')
    key = getpass.getpass('API 密钥：').strip()
    if not key or key == 'replace-with-your-own-api-key':
        print('配置尚未完成；填写 voice-server/.env 后重新运行安装脚本。')
        return 2
    base = input('基础地址（回车保留现有值）：').strip()
    model = input('模型名称（回车保留现有值）：').strip()
    if base:
        from urllib.parse import urlparse
        parsed = urlparse(base)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.path.rstrip('/').endswith('/chat/completions'):
            print('请填写 http(s) 基础地址，不包含账号、密码或 /chat/completions。配置未写入。')
            return 2
    set_key(env, 'MOMO_LLM_API_KEY', key)
    if base:
        set_key(env, 'MOMO_LLM_BASE_URL', base)
    if model:
        set_key(env, 'MOMO_LLM_MODEL', model)
    env.chmod(0o600)
    print('配置已保存到本机 voice-server/.env。')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(configure(Path(__file__).resolve().parent.parent / 'voice-server', '--non-interactive' not in sys.argv))
    except (KeyboardInterrupt, EOFError):
        print('\n配置已取消，可重新运行安装脚本。')
        sys.exit(2)
