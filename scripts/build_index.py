#! python3

from dataclasses import dataclass
from typing import Literal
import yaml
from pathlib import Path
import frontmatter
from mako.template import Template
from mako.lookup import TemplateLookup
from PIL import Image

PROJECT_DIR = Path("src/projects")
TEMPLATES_DIR = Path("src/templates")

OUTPUT_DIRECTORY = Path("output")
OUTPUT_PROJECT_DIR = Path("projects")
OUTPUT_INDEX = Path("index.html")

TEMPLATE_LOOKUP = TemplateLookup(directories=["src/templates"])

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'}
VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm'}

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

  thumbnail_image = image.copy()
  thumbnail_image.thumbnail(THUMBNAIL_MAX_SIZE, Image.Resampling.LANCZOS)
  thumbnail_path = OUTPUT_PROJECT_DIR / image_path.parent.name / f"{image_path.stem}_thumbnail.jpeg"
  resolved_thumbnail_path = OUTPUT_DIRECTORY / thumbnail_path
  resolved_thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
  thumbnail_image.save(resolved_thumbnail_path, 'JPEG', quality=90, optimize=True)

  full_image = image.copy()
  full_image.thumbnail(FULL_IMAGE_MAX_SIZE, Image.Resampling.LANCZOS)
  full_path = OUTPUT_PROJECT_DIR / image_path.parent.name / f"{image_path.stem}_full.jpeg"
  resolved_full_path = OUTPUT_DIRECTORY / full_path
  resolved_full_path.parent.mkdir(parents=True, exist_ok=True)
  full_image.save(resolved_full_path, 'JPEG', quality=90, optimize=True)

  return ImageResult(thumbnail_path=thumbnail_path, full_image_path=full_path)


def process_video(video: Path) -> None:
  # TODO: process video file
  # TODO: generate thumbnail
  # TODO: pass back file paths so they can be processed 
  print(f"{video=}")


def process_media(directory: Path) -> list[MediaResult]:
  all_results = []
  for file in directory.iterdir():
    if file.is_file():
      ext = file.suffix.lower()

      if ext in IMAGE_EXTENSIONS:
        image_result = process_image(file)
        all_results.append(image_result)
      elif ext in VIDEO_EXTENSIONS:
        process_video(file)
  return all_results


def render_index() -> str:
  index_template = TEMPLATE_LOOKUP.get_template('index.html')

  all_posts = []

  for category_dir in PROJECT_DIR.iterdir():
    if category_dir.is_dir():
      for project_dir in category_dir.iterdir():
        if project_dir.is_dir():
          media_list = process_media(project_dir)

          index_file = project_dir / "index.md"
          with open(index_file) as file:
            post = frontmatter.load(file)
            post['media'] = media_list
            print(post.metadata)
            all_posts.append(post)

  return index_template.render(items=all_posts)

rendered_html = render_index()

with open(OUTPUT_DIRECTORY / OUTPUT_INDEX, 'w') as index_file:
  index_file.write(rendered_html)

# # loop through each directory -- category
# # loop through each sub directory -- project
# # find index.md, parse into yaml

