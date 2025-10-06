
oct 4 2025
- if you run ./scripts/watch.md and then ctrl+c to exit, it will leave the python webserver running
- it runs under Python (NOT python) so run `ps aux | grep Python` to delete the process

todo:
- fix the script to kill the webserver
- get claude to split up cv.yaml into separate projects
- also get claude to copy over descriptions from old site
- write a script to parse projects folder
  - loop through each folder, collect media and metadata
  - generate thumbnails
  - produce an index with metadata and thumbnails
  - write javascript to allow gallery interactions
  - use template.html and build-cv.js as a template
