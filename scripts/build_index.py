#! python3
import argparse
import shutil
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
STATIC_DIR = Path("src/static")
FEATURED_PROJECTS = PROJECT_DIR / Path("featured.yaml")

OUTPUT_DIRECTORY = Path("output")
OUTPUT_PROJECT_DIR = Path("projects")
OUTPUT_STATIC_DIR = Path("static")
OUTPUT_INDEX = Path("index.html")

CATEGORY_ORDER = ["works", "talks", "awards", "performances", "press", "curation"]

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


def process_video(video_path: Path, reprocess_videos: bool, thumbnail_timestamp: float = 0) -> VideoResult:
    thumbnail_path = (
        OUTPUT_PROJECT_DIR
        / video_path.parent.name
        / f"{video_path.stem}_thumbnail.jpeg"
    )
    resolved_thumbnail_path = OUTPUT_DIRECTORY / thumbnail_path

    if not resolved_thumbnail_path.exists() or reprocess_videos:
        print("making thumbnail for video", resolved_thumbnail_path)
        resolved_thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
        (
            ffmpeg.input(str(video_path), ss=thumbnail_timestamp)
            .filter(
                "scale",
                f"min({THUMBNAIL_MAX_SIZE[0]},iw)",
                f"min({THUMBNAIL_MAX_SIZE[1]},ih)",
                force_original_aspect_ratio="decrease",
            )
            .output(str(resolved_thumbnail_path), vframes=1)
            .overwrite_output()
            .run(capture_stdout=False, capture_stderr=False)
        )

    video_output_path = (
        OUTPUT_PROJECT_DIR / video_path.parent.name / f"{video_path.stem}.mp4"
    )
    resolved_video_output_path = OUTPUT_DIRECTORY / video_output_path

    if not resolved_video_output_path.exists() or reprocess_videos:
        resolved_video_output_path.parent.mkdir(parents=True, exist_ok=True)
        (
            ffmpeg.input(str(video_path))
                .output(
                    str(resolved_video_output_path),
                    vcodec="libx264",
                    crf=23,
                    preset="medium",
                    acodec="aac",
                    audio_bitrate="128k",
                    movflags="faststart",
                    **{
                        "vf": f"scale=min({FULL_IMAGE_MAX_SIZE[0]}\\,iw):min({FULL_IMAGE_MAX_SIZE[1]}\\,ih):force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2"
                    },
                )
                .overwrite_output()
                .run()
        )

    return VideoResult(thumbnail_path=thumbnail_path, video_path=video_output_path)


def process_media(directory: Path, reprocess_videos: bool) -> list[MediaResult]:
    all_results = []
    for file in directory.iterdir():
        if file.is_file():
            ext = file.suffix.lower()
            if ext in IMAGE_EXTENSIONS:
                all_results.append(process_image(file))
            elif ext in VIDEO_EXTENSIONS:
                all_results.append(process_video(file, reprocess_videos, thumbnail_timestamp=0))
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


def render_index(reprocess_videos: bool) -> str:
    index_template = TEMPLATE_LOOKUP.get_template("index.html")

    items_by_category = {}
    items_by_id = {}

    for category_dir in PROJECT_DIR.iterdir():
        if category_dir.is_dir():
            items_by_category[category_dir.name] = []
            for project_dir in category_dir.iterdir():
                if project_dir.is_dir():
                    media_list = process_media(project_dir, reprocess_videos)
                    index_file = project_dir / "index.md"
                    with open(index_file) as file:
                        item = frontmatter.load(file)
                        item.metadata = render_markdown(item.metadata)  # type: ignore
                        item.content = markdown.markdown(item.content)
                        item["media"] = media_list
                        item["id"] = f"{category_dir.name}/{project_dir.name}"
                        items_by_category[category_dir.name].append(item)
                        items_by_id[item["id"]] = item

    featured_projects = []

    with open(FEATURED_PROJECTS, 'r') as file:
        data = yaml.safe_load(file)
        for featured_project_data in data:
            proj_id = featured_project_data["project"]
            featured_projects.append({
                **items_by_id[proj_id],
                **featured_project_data,
            })

    rendered_html = index_template.render(
        items_by_category=items_by_category,
        category_order=CATEGORY_ORDER,
        featured_projects=featured_projects)  # type: ignore
    
    with open(OUTPUT_DIRECTORY / OUTPUT_INDEX, "w") as index_file:
        index_file.write(rendered_html)

def copy_static_files():
    src = STATIC_DIR
    dst = OUTPUT_DIRECTORY / OUTPUT_STATIC_DIR
    dst.mkdir(parents=True, exist_ok=True)

    for file in src.glob('**/*'):
        if file.is_file():
            rel_path = file.relative_to(src)
            (dst / rel_path.parent).mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, dst / rel_path)


parser = argparse.ArgumentParser()
parser.add_argument('--reprocess-videos', action='store_true', help='Enable verbose output')
args = parser.parse_args()

render_index(reprocess_videos=args.reprocess_videos)
copy_static_files()