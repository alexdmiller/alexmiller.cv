#!/bin/bash

# How to use:
#
# Don't upload to prod:
#   scripts/watch.sh
# 
# Upload to prod:
#   scripts/watch.sh prod

# Check for dev flag
PROD_MODE=false
if [ "$1" = "prod" ]; then
    PROD_MODE=prod
else
    echo "Running in dev mode - skipping S3 sync and CloudFront invalidation"
    echo "Starting web server on http://localhost:9090"
    (cd output && python3 -m http.server 9092) &
    SERVER_PID=$!
    echo "Web server started with PID $SERVER_PID"

    # Clean up server on script exit
    trap "echo 'Stopping web server...'; kill $SERVER_PID 2>/dev/null" EXIT
fi

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
    node scripts/build-pages.js
    node scripts/build-showcase.js

    if [ "$PROD_MODE" = true ]; then
        echo "Syncing with S3 bucket..."
        rclone sync output/ s3:alexmiller.cv --stats-one-line --no-update-modtime -v

        echo "Invalidating CloudFront cache..."
        aws cloudfront create-invalidation \
            --distribution-id E3TWYLS4PA6LY9 \
            --paths "/*"
    fi
    echo "Done."
done