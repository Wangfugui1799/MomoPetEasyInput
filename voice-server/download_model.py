"""Fetch the preset int8 SenseVoice model; never unpack arbitrary archive paths."""
import hashlib
from pathlib import Path
import shutil
import tarfile
import tempfile

MODEL_DIR = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/' + MODEL_DIR + '.tar.bz2'
HASHES = {
    'model.int8.onnx': 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51',
    'tokens.txt': 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc',
}


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def extract_verified(archive, staging):
    found = set()
    with tarfile.open(archive, 'r:bz2') as source:
        for member in source:
            relative = member.name.removeprefix('./')
            name = relative.removeprefix(MODEL_DIR + '/')
            if relative != MODEL_DIR + '/' + name or name not in (*HASHES, 'LICENSE'):
                continue
            if not member.isfile() or name in found or member.size > 300 * 1024 * 1024:
                raise ValueError('模型压缩包包含无效文件')
            with source.extractfile(member) as reader, (staging / name).open('wb') as writer:
                shutil.copyfileobj(reader, writer)
            found.add(name)
    if not set(HASHES).issubset(found):
        raise ValueError('下载包缺少模型或 tokens.txt')
    for name, expected in HASHES.items():
        if digest(staging / name) != expected:
            raise ValueError('模型校验失败：' + name + '，未安装；请重新下载')


def ensure_model(models=None):
    import requests
    models = Path(models) if models else Path(__file__).resolve().parent / 'models'
    target = models / MODEL_DIR
    if all((target / name).is_file() and digest(target / name) == expected for name, expected in HASHES.items()):
        print('SenseVoice 模型校验通过。', flush=True)
        return target
    models.mkdir(parents=True, exist_ok=True)
    print('首次下载 SenseVoice int8 模型，约 230 MB，请等待：\n' + URL, flush=True)
    with tempfile.TemporaryDirectory(prefix='.download-', dir=models) as temporary:
        staging = Path(temporary)
        archive = staging / 'model.tar.bz2'
        with requests.get(URL, stream=True, timeout=(15, 60)) as response:
            response.raise_for_status()
            received = 0
            with archive.open('wb') as writer:
                for chunk in response.iter_content(1024 * 1024):
                    writer.write(chunk)
                    received += len(chunk)
                    if received > 400 * 1024 * 1024:
                        raise ValueError('模型下载超过预期大小')
                    if received // (20 * 1024 * 1024) != (received - len(chunk)) // (20 * 1024 * 1024):
                        print('已下载 ' + str(received // 1024 // 1024) + ' MB', flush=True)
        extract_verified(archive, staging)
        target.mkdir(exist_ok=True)
        for name in (*HASHES, 'LICENSE'):
            if (staging / name).is_file():
                (staging / name).replace(target / name)
    print('SenseVoice 模型下载并校验完成。', flush=True)
    return target


if __name__ == '__main__':
    ensure_model()
