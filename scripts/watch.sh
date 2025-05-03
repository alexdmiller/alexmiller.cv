#!/bin/bash

# Monitor the directory and run commands when files change
fswatch -o src/ | while read 
do
    echo "File change detected!"
    node scripts/build-gallery.js
    node scripts/build-cv.js
done