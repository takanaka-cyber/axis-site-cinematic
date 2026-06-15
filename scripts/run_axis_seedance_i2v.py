"""Generate AXIS cinematic image-to-video clips with fal.ai / Seedance."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import fal_client
import requests


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCENE_DIR = PROJECT_ROOT / "assets" / "scenes"
OUTPUT_DIR = PROJECT_ROOT / "assets" / "video"
MANIFEST_PATH = OUTPUT_DIR / "seedance_manifest.json"

MODEL = "bytedance/seedance-2.0/image-to-video"
DURATION = "5"
RESOLUTION = "720p"
ASPECT_RATIO = "16:9"

ENV_CANDIDATES = [
    Path.home() / "Desktop/AI_Test/02_動画生成_PoC/ugc_poc_manjaro/.env",
    Path.home()
    / "Desktop/AI_Automation/UGC_Project/tts_cr/projects/20260525_ekam_review_type_ugc/.env",
]

SHARED_NEGATIVE = (
    "No text overlay, no subtitles, no logo animation, no UI captions, no extra words, "
    "no human face close-up distortion, no melted geometry, no warped Japanese text, "
    "no cartoon style, no flat illustration. Preserve the original scene composition and premium dark AXIS mood."
)

SCENES: list[dict[str, str]] = [
    {
        "id": "scene-01-axis-awakens",
        "source": "scene-01-axis-awakens.png",
        "output": "scene-01-axis-awakens.mp4",
        "prompt": (
            "Cinematic corporate sci-fi hero scene. A massive crystalline axis floats through dark space, "
            "black debris and dust drift in parallax, luminous cyan violet energy pulses inside the prism. "
            "Create a strong slow push-in with slight orbit, foreground particles crossing the lens, subtle light flares, "
            "and a dramatic atmosphere like a premium interactive web intro. Keep the lone silhouette and giant axis stable."
        ),
    },
    {
        "id": "scene-02-invisible-structure",
        "source": "scene-02-invisible-structure.png",
        "output": "scene-02-invisible-structure.mp4",
        "prompt": (
            "Abstract invisible business structure scene. Ink-like black nebula, fine network lines, glowing nodes, "
            "and white negative space breathe and expand. Use a slow macro dolly move from left to right, "
            "nodes connecting with faint electric pulses and liquid ink curling gently. Premium monochrome, quiet but alive."
        ),
    },
    {
        "id": "scene-03-signal-strategy",
        "source": "scene-03-signal-strategy.png",
        "output": "scene-03-signal-strategy.mp4",
        "prompt": (
            "Data signals becoming strategy. Neon blue and magenta light trails converge into a single axis in a dark digital space. "
            "Animate fast but elegant signal streams, tiny particles, subtle camera acceleration forward, and a luminous convergence point. "
            "Make it feel like fragmented web ads, SEO, data and creative are being pulled into one strategic route."
        ),
    },
    {
        "id": "scene-04-web-interface",
        "source": "scene-04-web-interface.png",
        "output": "scene-04-web-interface.mp4",
        "prompt": (
            "A futuristic web interface control room. Transparent panels, wireframes, site structures, and luminous glass UI layers float in depth. "
            "Move through the interface with parallax, slight tilt, glowing cursor-like streaks, and depth-of-field. "
            "Keep all UI as abstract shapes, not readable text. Premium dark web design and architecture mood."
        ),
    },
    {
        "id": "scene-05-film-3dcg",
        "source": "scene-05-film-3dcg.png",
        "output": "scene-05-film-3dcg.mp4",
        "prompt": (
            "Film and 3DCG become experience. A sculptural asteroid-like object and orbital light rings rotate slowly in a deep cinematic environment. "
            "Add a smooth camera orbit, glowing rim light, dust particles, volumetric beams, and subtle energy waves passing through the frame. "
            "The motion should feel spatial and immersive, like entering a premium 3D brand experience."
        ),
    },
    {
        "id": "scene-06-one-team",
        "source": "scene-06-one-team.png",
        "output": "scene-06-one-team.mp4",
        "prompt": (
            "One team, many specialists. Human silhouettes stand inside a dark high-end studio surrounded by floating strategy, design, code, film and data fragments. "
            "Add slow dolly-in, parallax between silhouettes and transparent panels, thin light beams linking people into one axis, and atmospheric particles. "
            "Keep bodies stable and elegant, no face detail changes."
        ),
    },
    {
        "id": "scene-07-growth-gate",
        "source": "scene-07-growth-gate.png",
        "output": "scene-07-growth-gate.mp4",
        "prompt": (
            "The growth gate. A luminous geometric portal opens in a dark business cosmos, with flowing analytics-like lines and particles moving toward the center. "
            "Create a dramatic forward camera move, the gate breathing with light, and subtle data streams bending into the axis. "
            "Premium, sharp, strategic, not fantasy."
        ),
    },
    {
        "id": "scene-08-next-axis",
        "source": "scene-08-next-axis.png",
        "output": "scene-08-next-axis.mp4",
        "prompt": (
            "The next axis. A distant horizon and vertical luminous column become the final CTA atmosphere. "
            "Animate a calm but powerful pull toward the light column, sweeping road-like light trails, floating particles, and slow orbital rings. "
            "Make it feel like the business is moving into the next phase. Elegant, cinematic, premium dark brand ending."
        ),
    },
]


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def log(message: str) -> None:
    print(message, flush=True)


def load_env() -> None:
    for env_path in ENV_CANDIDATES:
        if not env_path.exists():
            continue
        for raw in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    if not os.environ.get("FAL_KEY"):
        sys.exit("ERROR: FAL_KEY is not set")


def load_manifest() -> dict[str, Any]:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {
        "project": "AXIS cinematic website prototype",
        "createdAt": now_iso(),
        "destination": "fal.ai / Seedance image-to-video",
        "model": MODEL,
        "duration": DURATION,
        "resolution": RESOLUTION,
        "aspectRatio": ASPECT_RATIO,
        "scope": "AXIS scene-board i2v only. No Drive upload, no external sharing.",
        "items": [],
    }


def save_manifest(manifest: dict[str, Any]) -> None:
    manifest["updatedAt"] = now_iso()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def update_manifest_item(manifest: dict[str, Any], item: dict[str, Any]) -> None:
    manifest["items"] = [
        old for old in manifest.get("items", []) if old.get("sceneId") != item["sceneId"]
    ]
    manifest["items"].append(item)
    manifest["items"].sort(key=lambda entry: entry.get("order", 0))
    save_manifest(manifest)


def download_video(url: str, output_path: Path) -> None:
    with requests.get(url, stream=True, timeout=900) as response:
        response.raise_for_status()
        with output_path.open("wb") as fh:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    fh.write(chunk)


def generate_scene(order: int, scene: dict[str, str], manifest: dict[str, Any], force: bool) -> None:
    source_path = SCENE_DIR / scene["source"]
    output_path = OUTPUT_DIR / scene["output"]
    if not source_path.exists():
        raise FileNotFoundError(source_path)

    existing = next(
        (
            item
            for item in manifest.get("items", [])
            if item.get("sceneId") == scene["id"] and item.get("status") == "ok"
        ),
        None,
    )
    if existing and output_path.exists() and not force:
        log(f"[skip] {scene['id']} already exists: {output_path.name}")
        return

    full_prompt = f"{scene['prompt']} {SHARED_NEGATIVE}"
    started_at = now_iso()
    t0 = time.time()
    log(f"[start] {scene['id']} -> {output_path.name}")

    item: dict[str, Any] = {
        "order": order,
        "sceneId": scene["id"],
        "sourceImage": str(source_path),
        "video": str(output_path),
        "prompt": full_prompt,
        "model": MODEL,
        "duration": DURATION,
        "resolution": RESOLUTION,
        "aspectRatio": ASPECT_RATIO,
        "status": "running",
        "startedAt": started_at,
    }
    update_manifest_item(manifest, item)

    try:
        image_url = fal_client.upload_file(str(source_path))
        result = fal_client.subscribe(
            MODEL,
            arguments={
                "prompt": full_prompt,
                "image_url": image_url,
                "duration": DURATION,
                "resolution": RESOLUTION,
                "aspect_ratio": ASPECT_RATIO,
                "camera_fixed": False,
                "generate_audio": False,
            },
            with_logs=False,
        )
        video_url = (result.get("video") or {}).get("url")
        if not video_url:
            raise RuntimeError(f"fal.ai result did not include video url: {result}")
        download_video(video_url, output_path)
        item.update(
            {
                "status": "ok",
                "completedAt": now_iso(),
                "elapsedSeconds": round(time.time() - t0, 1),
                "falVideoUrl": video_url,
                "result": result,
                "fileSizeBytes": output_path.stat().st_size,
            }
        )
        log(
            f"[ok] {scene['id']} {item['elapsedSeconds']}s "
            f"{output_path.stat().st_size / 1024 / 1024:.1f}MB"
        )
    except Exception as exc:
        item.update({"status": "error", "completedAt": now_iso(), "error": str(exc)})
        log(f"[error] {scene['id']}: {exc}")
        raise
    finally:
        update_manifest_item(manifest, item)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="Scene ids to generate")
    parser.add_argument("--force", action="store_true", help="Regenerate existing ok clips")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    load_env()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    manifest.update(
        {
            "status": "running",
            "model": MODEL,
            "duration": DURATION,
            "resolution": RESOLUTION,
            "aspectRatio": ASPECT_RATIO,
        }
    )
    save_manifest(manifest)

    only = set(args.only or [])
    scenes = [scene for scene in SCENES if not only or scene["id"] in only]
    unknown = only - {scene["id"] for scene in SCENES}
    if unknown:
        raise SystemExit(f"Unknown scene id(s): {', '.join(sorted(unknown))}")

    for order, scene in enumerate(scenes, start=1):
        generate_scene(order, scene, manifest, force=args.force)

    if not only:
        manifest["status"] = "ok"
        manifest["completedAt"] = now_iso()
        save_manifest(manifest)
    log(f"[done] {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
