#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from huggingface_hub import snapshot_download
import onnx
from onnxruntime.quantization import QuantType, quantize_dynamic

MODEL_ID = "philschmid/MiniLM-L6-H384-uncased-sst2"
MODEL_REVISION = "0c0ecdc39368f87291727ec084111e89e30b45b2"
EXPECTED_FILES = {
    "config.json": (830, "3b31ca2ace86e10d0a738e72ce52143b09bbba9e7100306eff91448e1d64ca9f"),
    "tokenizer.json": (466247, "be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037"),
    "tokenizer_config.json": (512, "c12bf6c7c8a25f696582ac6d9fc38c606c93a8a5bdf71bcdf6af35a37c3c6e4e"),
    "onnx/model_quantized.onnx": (23075378, "f446516c826577aaa42b2bc6e874b9fc4c9d3fc836d80a540707a289f42184b9"),
}
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "models" / MODEL_ID


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    with tempfile.TemporaryDirectory(prefix="confqual-minilm-export-") as temporary:
        temporary = Path(temporary)
        source = temporary / "source"
        exported = temporary / "exported"
        packaged = temporary / "packaged"

        snapshot_download(
            repo_id=MODEL_ID,
            revision=MODEL_REVISION,
            allow_patterns=["config.json", "pytorch_model.bin", "tokenizer.json", "tokenizer_config.json"],
            cache_dir=temporary / "cache",
            local_dir=source,
        )

        environment = os.environ.copy()
        environment["HF_HOME"] = str(temporary / "cache")
        subprocess.run(
            [
                sys.executable,
                "-m",
                "transformers.onnx",
                "--model",
                str(source),
                "--feature",
                "sequence-classification",
                "--opset",
                "14",
                "--framework",
                "pt",
                "--export_with_transformers",
                str(exported),
            ],
            check=True,
            env=environment,
        )

        (packaged / "onnx").mkdir(parents=True)
        model_path = packaged / "onnx" / "model_quantized.onnx"
        quantize_dynamic(
            exported / "model.onnx",
            model_path,
            weight_type=QuantType.QInt8,
            per_channel=False,
            reduce_range=False,
        )
        onnx.checker.check_model(model_path)

        config = json.loads((source / "config.json").read_text(encoding="utf-8"))
        config["id2label"] = {"0": "NEGATIVE", "1": "POSITIVE"}
        config["label2id"] = {"NEGATIVE": 0, "POSITIVE": 1}
        (packaged / "config.json").write_text(f"{json.dumps(config, indent=2)}\n", encoding="utf-8")
        shutil.copy2(source / "tokenizer.json", packaged / "tokenizer.json")
        shutil.copy2(source / "tokenizer_config.json", packaged / "tokenizer_config.json")

        for relative_path, (expected_size, expected_hash) in EXPECTED_FILES.items():
            artifact = packaged / relative_path
            if artifact.stat().st_size != expected_size or sha256(artifact) != expected_hash:
                raise RuntimeError(f"Unexpected MiniLM artifact: {relative_path}")

        if OUTPUT_DIR.exists():
            shutil.rmtree(OUTPUT_DIR)
        OUTPUT_DIR.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(packaged, OUTPUT_DIR)

    print(f"MiniLM sentiment model ready at {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
