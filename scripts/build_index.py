#! python3

import markdown
from dataclasses import dataclass
from typing import Literal
import yaml
from pathlib import Path
import frontmatter
from mako.template import Template
from mako.lookup import TemplateLookup
from PIL import Image
import ffmpeg

PROJECT_DIR = Path("src/projects")
TEMPLATES_DIR = Path("src/templates")

OUTPUT_DIRECTORY = Path("output")
OUTPUT_PROJECT_DIR = Path("projects")
OUTPUT_INDEX = Path("index.html")

TEMPLATE_LOOKUP = TemplateLookup(directories=["src/templates"])

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff"}
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".flv", ".wmv", ".webm"}

THUMBNAIL_MAX_SIZE: tuple[int, int] = (500, 500)
FULL_IMAGE_MAX_SIZE: tuple[int, int] = (1920, 1920)


@dataclass
class ImageResult:
    thumbnail_path: Path
    full_image_path: Path
    type: Literal["image"] = "image"


@dataclass
class VideoResult:
    thumbnail_path: Path
    video_path: Path
    type: Literal["video"] = "video"


MediaResult = ImageResult | VideoResult


def process_image(image_path: Path) -> ImageResult:
    image = Image.open(image_path)

    thumbnail_path = (
        OUTPUT_PROJECT_DIR
        / image_path.parent.name
        / f"{image_path.stem}_thumbnail.jpeg"
    )
    resolved_thumbnail_path = OUTPUT_DIRECTORY / thumbnail_path

    if not resolved_thumbnail_path.exists():
        thumbnail_image = image.copy()
        thumbnail_image.thumbnail(THUMBNAIL_MAX_SIZE, Image.Resampling.LANCZOS)
        resolved_thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
        thumbnail_image.save(resolved_thumbnail_path, "JPEG", quality=90, optimize=True)

    full_path = (
        OUTPUT_PROJECT_DIR / image_path.parent.name / f"{image_path.stem}_full.jpeg"
    )
    resolved_full_path = OUTPUT_DIRECTORY / full_path

    if not resolved_full_path.exists():
        full_image = image.copy()
        full_image.thumbnail(FULL_IMAGE_MAX_SIZE, Image.Resampling.LANCZOS)
        resolved_full_path.parent.mkdir(parents=True, exist_ok=True)
        full_image.save(resolved_full_path, "JPEG", quality=90, optimize=True)

    return ImageResult(thumbnail_path=thumbnail_path, full_image_path=full_path)


def process_video(video_path: Path, thumbnail_frame: float = 1) -> VideoResult:
    thumbnail_path = (
        OUTPUT_PROJECT_DIR
        / video_path.parent.name
        / f"{video_path.stem}_thumbnail.jpeg"
    )
    resolved_thumbnail_path = OUTPUT_DIRECTORY / thumbnail_path

    if not resolved_thumbnail_path.exists():
        (
            ffmpeg.input(str(video_path), ss=thumbnail_frame)
            .filter(
                "scale",
                f"min({THUMBNAIL_MAX_SIZE[0]},iw)",
                f"min({THUMBNAIL_MAX_SIZE[1]},ih)",
                force_original_aspect_ratio="decrease",
            )
            .output(str(resolved_thumbnail_path), vframes=1)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )

    video_output_path = (
        OUTPUT_PROJECT_DIR / video_path.parent.name / f"{video_path.stem}.mp4"
    )
    resolved_video_output_path = OUTPUT_DIRECTORY / video_output_path

    if not resolved_video_output_path.exists():
        (
            ffmpeg.input(str(video_path))
            .output(
                str(resolved_video_output_path),
                vcodec="libx264",  # H.264 codec (widely supported)
                crf=23,  # Quality (18-28, lower = better quality)
                preset="medium",  # Encoding speed vs compression
                acodec="aac",  # AAC audio codec
                audio_bitrate="128k",  # Audio bitrate
                movflags="faststart",  # Enable streaming (moves metadata to front)
                **{
                    "vf": f"scale=min({FULL_IMAGE_MAX_SIZE[0]}\\,iw):min({FULL_IMAGE_MAX_SIZE[1]}\\,ih):force_original_aspect_ratio=decrease"
                },
            )
            .overwrite_output()
            .run(capture_stdout=False, capture_stderr=False)
        )

    return VideoResult(thumbnail_path=thumbnail_path, video_path=video_output_path)


def process_media(directory: Path) -> list[MediaResult]:
    all_results = []
    for file in directory.iterdir():
        if file.is_file():
            ext = file.suffix.lower()
            if ext in IMAGE_EXTENSIONS:
                all_results.append(process_image(file))
            elif ext in VIDEO_EXTENSIONS:
                all_results.append(process_video(file, 10))
    return all_results


def render_markdown(value: dict | list | str):
    if isinstance(value, dict):
        return {k: render_markdown(v) for k, v in value.items()}

    if isinstance(value, list):
        return [render_markdown(v) for v in value]

    if isinstance(value, str):
        html = markdown.markdown(value)
        if html.startswith("<p>") and html.endswith("</p>"):
            return html[3:-4]


def render_index() -> str:
    index_template = TEMPLATE_LOOKUP.get_template("index.html")

    all_posts = []

    for category_dir in PROJECT_DIR.iterdir():
        if category_dir.is_dir():
            for project_dir in category_dir.iterdir():
                if project_dir.is_dir():
                    media_list = process_media(project_dir)

                    index_file = project_dir / "index.md"
                    with open(index_file) as file:
                        post = frontmatter.load(file)
                        post.metadata = render_markdown(post.metadata)  # type: ignore

                        post["media"] = media_list
                        print(post.metadata)
                        all_posts.append(post)

    return index_template.render(items=all_posts)  # type: ignore


rendered_html = render_index()

with open(OUTPUT_DIRECTORY / OUTPUT_INDEX, "w") as index_file:
    index_file.write(rendered_html)

# # loop through each directory -- category
# # loop through each sub directory -- project
# # find index.md, parse into yaml
