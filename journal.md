dec 6 2025
----------

todo:


oct 19 2025
-----------

x fix featured thumbnails / gifs
- add little art feature

oct 13 2025
-----------

todo:
x copy over all the data i have from alex.miller.garden
- left/right arrow hover colors
- custom "x" for closing gallery view
x thumbnails should fit better to grid (centered in grid cells?)
- use gif for videos? have a play button?
x fix the vids that aren't working
- allow a custom order for media
- enforce an order for dates
- update URL when clicking on item, append to history, and when page is loaded process that fragment
- figure out where to put arrows

oct 12 2025
-----------

todo:
- resize thumbnail to be right size
- maybe start on CSS?
- image / video caching
- need to order the dates correctly
- get layout of content + gallery correct

oct 11 2025
-----------

- started on process_image / process_video

todo:
- flesh out process_image and process_video functions
- copy over data from alex.miller.garden
- question: should media be committed to github? probably not, right? so should projects/ folder not be committed at all?

oct 7 2025
----------

- got things working with generating a bunch of individual project files
- build_project.py parses these project md files
- now trying to get templates working

  todo:
  - flesh out templates
  - copy relevant CSS and stuff
  - spit out some output
  - copy over project descriptions from old site
  - add images, gallery etc. 

oct 4 2025
----------

- if you run ./scripts/watch.md and then ctrl+c to exit, it will leave the python webserver running
- it runs under Python (NOT python) so run `ps aux | grep Python` to delete the process

  todo:
  - fix the script to kill the webserver
  x get claude to split up cv.yaml into separate projects
  - also get claude to copy over descriptions from old site
  - write a script to parse projects folder
    - loop through each folder, collect media and metadata
    - generate thumbnails
    - produce an index with metadata and thumbnails
    - write javascript to allow gallery interactions
    - use template.html and build-cv.js as a template
