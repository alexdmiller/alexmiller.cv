#! python3

import yaml
from pathlib import Path
import frontmatter
from mako.template import Template
from mako.lookup import TemplateLookup
from PIL import Image

PROJECT_DIR = Path("src/projects")
TEMPLATES_DIR = Path("src/templates")
OUTPUT_PROJECT_DIR = Path("output/projects")

TEMPLATE_LOOKUP = TemplateLookup(directories=["src/templates"])

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'}
VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm'}

THUMBNAIL_MAX_SIZE: tuple[int, int] = (300, 300)
FULL_IMAGE_MAX_SIZE: tuple[int, int] = (1920, 1920)

def process_image(image_path: Path) -> None:
  image = Image.open(image_path)

  thumbnail_image = image.copy()
  thumbnail_image.thumbnail(THUMBNAIL_MAX_SIZE, Image.Resampling.LANCZOS)
  thumbnail_path = OUTPUT_PROJECT_DIR / image_path.parent.name / f"{image_path.stem}_thumbnail.jpeg"
  thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
  thumbnail_image.save(thumbnail_path, 'JPEG', quality=90, optimize=True)

  full_image = image.copy()
  full_image.thumbnail(FULL_IMAGE_MAX_SIZE, Image.Resampling.LANCZOS)
  full_path = OUTPUT_PROJECT_DIR / image_path.parent.name / f"{image_path.stem}_full.jpeg"
  full_path.parent.mkdir(parents=True, exist_ok=True)
  full_image.save(full_path, 'JPEG', quality=90, optimize=True)

  # TODO: pass back the paths so they can be collected

def process_video(video: Path) -> None:
  # TODO: process video file
  # TODO: generate thumbnail
  # TODO: pass back file paths so they can be processed 
  print(f"{video=}")

def process_media(directory: Path) -> None:
  for file in directory.iterdir():
    if file.is_file():
      ext = file.suffix.lower()

      if ext in IMAGE_EXTENSIONS:
        process_image(file)
      elif ext in VIDEO_EXTENSIONS:
        process_video(file)



def render_index() -> None:
  index_template = TEMPLATE_LOOKUP.get_template('index.html')

  all_posts = []

  for category_dir in PROJECT_DIR.iterdir():
    if category_dir.is_dir():
      for project_dir in category_dir.iterdir():
        if project_dir.is_dir():
          process_media(project_dir)

          index_file = project_dir / "index.md"
          with open(index_file) as file:
            post = frontmatter.load(file)

            all_posts.append(post)

  # print(index_template.render(items=all_posts))

render_index()

# # loop through each directory -- category
# # loop through each sub directory -- project
# # find index.md, parse into yaml

