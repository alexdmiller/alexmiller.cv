#! python3

import yaml
from pathlib import Path
import frontmatter

PROJECT_DIR = "src/projects"

for category_dir in Path(PROJECT_DIR).iterdir():
  if category_dir.is_dir():
    for project_dir in category_dir.iterdir():
      if project_dir.is_dir():
        print(project_dir.name)
        index_file = project_dir / "index.yaml"
        with open(index_file) as file:
          post = frontmatter.load(file)
          print(post)


# loop through each directory -- category
# loop through each sub directory -- project
# find index.md, parse into yaml
