#!/bin/bash

# Monitor the directory and run commands when files change
fswatch \
  --event=Updated \
  --event=Created \
  --event=Removed \
  -o src/ | while read 
do
    echo "File change detected!"
    node scripts/build-gallery.js
    node scripts/build-cv.js

    echo "Syncing with S3 bucket..."
    rclone sync output/ s3:alexmiller.cv --stats-one-line --no-update-modtime -v

    echo "Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id E3TWYLS4PA6LY9 \
        --paths "/*"
    echo "Done."
done