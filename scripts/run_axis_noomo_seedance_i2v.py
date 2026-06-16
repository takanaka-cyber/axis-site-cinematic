"""Generate Noomo-style AXIS image-to-video clips with fal.ai / Seedance."""

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
SOURCE_DIR = PROJECT_ROOT / "assets" / "generated" / "noomo-axis-20260616"
OUTPUT_DIR = PROJECT_ROOT / "assets" / "generated" / "noomo-axis-20260616" / "i2v"
MANIFEST_PATH = OUTPUT_DIR / "seedance_noomo_manifest.json"

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
    "No text overlay, no subtitles, no logo, no UI captions, no extra words, "
    "no readable letters, no distorted typography, no cartoon style, no anime style, "
    "no flat illustration, no melted geometry, no sudden object replacement. "
    "Preserve the original scene composition, premium dark AXIS mood, and crystalline axis motif."
)

CLIPS: list[dict[str, str]] = [
    {
        "id": "axis-noomo-scene-01-push-in",
        "source": "axis-noomo-scene-01.png",
        "output": "axis-noomo-scene-01-push-in.mp4",
        "prompt": (
            "Slow cinematic camera push-in toward the suspended luminous crystal axis. "
            "Foreground rocks and glass monoliths drift past the lens with subtle parallax, "
            "tiny particles float in the dark void, the crystal energy pulses gently. "
            "Keep the human silhouette small and stable, keep the composition premium and monumental."
        ),
    },
    {
        "id": "axis-noomo-scene-02-enter-crystal",
        "source": "axis-noomo-scene-02.png",
        "output": "axis-noomo-scene-02-enter-crystal.mp4",
        "prompt": (
            "Macro pass-through camera move into the translucent crystalline surface. "
            "Foreground glass facets slide across the frame, network lines and data clouds inside the crystal expand in depth, "
            "light refracts and bends as if the camera is entering the structure. Elegant, controlled, not chaotic."
        ),
    },
    {
        "id": "axis-noomo-scene-03-lateral-data-current",
        "source": "axis-noomo-scene-03.png",
        "output": "axis-noomo-scene-03-lateral-data-current.mp4",
        "prompt": (
            "High-speed lateral camera travel from left to right through a dark data current. "
            "Light trails, abstract graphs, particles, and transparent panels streak past at different depths, "
            "while the crystalline axis remains coherent in the distance. Dynamic but premium, like scroll-driven digital storytelling."
        ),
    },
    {
        "id": "axis-noomo-scene-04-forward-ui-corridor",
        "source": "axis-noomo-scene-04.png",
        "output": "axis-noomo-scene-04-forward-ui-corridor.mp4",
        "prompt": (
            "Forward dolly through a transparent web architecture corridor toward the crystal axis at the vanishing point. "
            "Glass floors, abstract UI panels, wireframe frames, and luminous route lines pass by with strong parallax. "
            "No readable interface text, only abstract shapes. Smooth, immersive, spatial."
        ),
    },
    {
        "id": "axis-noomo-scene-05-orbit-object",
        "source": "axis-noomo-scene-05.png",
        "output": "axis-noomo-scene-05-orbit-object.mp4",
        "prompt": (
            "Smooth camera orbit around the central crystalline orbital object. "
            "Film-strip arcs, glowing rings, shards, and particles rotate gently at layered depths, "
            "large foreground fragments briefly occlude the view. Preserve the object shape and high-end cinematic 3D mood."
        ),
    },
    {
        "id": "axis-noomo-scene-07-vertical-ascent",
        "source": "axis-noomo-scene-07.png",
        "output": "axis-noomo-scene-07-vertical-ascent.mp4",
        "prompt": (
            "Vertical camera ascent from bottom to top through the luminous shaft. "
            "Golden data particles rise upward, glass light gates pass the camera, growth curves glow inside the architecture, "
            "and the crystal axis stretches into a tower of light. Strong upward motion, stable premium composition."
        ),
    },
    {
        "id": "axis-noomo-scene-09-exit-gate",
        "source": "axis-noomo-scene-09.png",
        "output": "axis-noomo-scene-09-exit-gate.mp4",
        "prompt": (
            "Forward camera move through the luminous exit gate toward a calm horizon. "
            "Portal edges and glass pillars pass close to the lens, the crystalline gateway breathes with soft light, "
            "the dark environment opens into a hopeful future glow. Smooth, premium, refined, not explosive."
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
        "project": "AXIS Noomo-style cinematic website prototype",
        "createdAt": now_iso(),
        "destination": "fal.ai / Seedance image-to-video",
        "model": MODEL,
        "duration": DURATION,
        "resolution": RESOLUTION,
        "aspectRatio": ASPECT_RATIO,
        "scope": "AXIS Noomo-style i2v only. No Drive upload, no external sharing.",
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
        old for old in manifest.get("items", []) if old.get("clipId") != item["clipId"]
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


def generate_clip(order: int, clip: dict[str, str], manifest: dict[str, Any], force: bool) -> None:
    source_path = SOURCE_DIR / clip["source"]
    output_path = OUTPUT_DIR / clip["output"]
    if not source_path.exists():
        raise FileNotFoundError(source_path)

    existing = next(
        (
            item
            for item in manifest.get("items", [])
            if item.get("clipId") == clip["id"] and item.get("status") == "ok"
        ),
        None,
    )
    if existing and output_path.exists() and not force:
        log(f"[skip] {clip['id']} already exists: {output_path.name}")
        return

    full_prompt = f"{clip['prompt']} {SHARED_NEGATIVE}"
    t0 = time.time()
    log(f"[start] {clip['id']} -> {output_path.name}")

    item: dict[str, Any] = {
        "order": order,
        "clipId": clip["id"],
        "sourceImage": str(source_path),
        "video": str(output_path),
        "prompt": full_prompt,
        "model": MODEL,
        "duration": DURATION,
        "resolution": RESOLUTION,
        "aspectRatio": ASPECT_RATIO,
        "status": "running",
        "startedAt": now_iso(),
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
            f"[ok] {clip['id']} {item['elapsedSeconds']}s "
            f"{output_path.stat().st_size / 1024 / 1024:.1f}MB"
        )
    except Exception as exc:
        item.update({"status": "error", "completedAt": now_iso(), "error": str(exc)})
        log(f"[error] {clip['id']}: {exc}")
        raise
    finally:
        update_manifest_item(manifest, item)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="Clip ids to generate")
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
    clips = [clip for clip in CLIPS if not only or clip["id"] in only]
    unknown = only - {clip["id"] for clip in CLIPS}
    if unknown:
        raise SystemExit(f"Unknown clip id(s): {', '.join(sorted(unknown))}")

    for order, clip in enumerate(clips, start=1):
        generate_clip(order, clip, manifest, force=args.force)

    if not only:
        manifest["status"] = "ok"
        manifest["completedAt"] = now_iso()
        save_manifest(manifest)
    log(f"[done] {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
