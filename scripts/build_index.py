#! python3

import yaml
from pathlib import Path
import frontmatter
from mako.template import Template
from mako.lookup import TemplateLookup

PROJECT_DIR = Path("src/projects")
TEMPLATES_DIR = Path("src/templates")

lookup = TemplateLookup(directories=["src/templates"])
index_template = lookup.get_template('index.html')

all_posts = []

# TODO: render using the template
for category_dir in PROJECT_DIR.iterdir():
  if category_dir.is_dir():
    for project_dir in category_dir.iterdir():
      if project_dir.is_dir():
        # print(project_dir.name)
        index_file = project_dir / "index.md"
        with open(index_file) as file:
          post = frontmatter.load(file)
          all_posts.append(post)
          # print(frontmatter.dumps(post))

print(index_template.render(items=all_posts))

# # loop through each directory -- category
# # loop through each sub directory -- project
# # find index.md, parse into yaml

