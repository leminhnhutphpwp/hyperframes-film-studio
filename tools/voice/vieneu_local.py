"""VieNeu-TTS v3 Turbo (Apache-2.0) loaded from a PLAIN model folder (runtime/models/), not the Hugging Face symlink
cache — newer onnxruntime refuses symlinks ("External data path escapes model directory"). Used by vieneu_worker.py
inside runtime/venv-vieneu. Models: runtime/models/vieneu-v3-turbo + runtime/models/moss-codec (git-ignored)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]   # videostudio (tools/voice/ -> ../..)
BACKBONE = ROOT / "runtime/models/vieneu-v3-turbo"
CODEC = ROOT / "runtime/models/moss-codec"


def ensure_models():
    from huggingface_hub import snapshot_download
    if not (BACKBONE / "config.json").exists():
        snapshot_download("pnnbao-ump/VieNeu-TTS-v3-Turbo", local_dir=str(BACKBONE))
    if not any(CODEC.glob("*.onnx")):
        snapshot_download("OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX", local_dir=str(CODEC))


def load(precision="fp32"):
    ensure_models()
    from vieneu._v3_turbo_engine import onnx_runtime_lite as m
    sub = {"int8": "onnx_int8", "fp32": "onnx_update"}[precision]

    def fetch(repo, files, subfolder):          # repo Hugging Face -> thư mục local tương ứng
        if "MOSS" in str(repo):
            return CODEC
        return BACKBONE / (subfolder or "")
    m.OnnxV3LiteEngine._fetch = staticmethod(fetch)
    from vieneu import Vieneu
    return Vieneu(backbone_repo=str(BACKBONE), onnx_subfolder=sub)
