// Configuration
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { exec } = require("child_process");
const sharp = require("sharp"); // For image processing

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const unlink = promisify(fs.unlink); // For deleting files
const rmdir = promisify(fs.rmdir); // For deleting directories
const execPromise = promisify(exec);

const THUMBNAIL_SIZE = 600; // Max dimension of thumbnails in pixels (increased for higher quality)
const VIDEO_PREVIEW_HEIGHT = 400; // Max height for video previews in pixels
const VIDEO_PREVIEW_DURATION = 1; // Max duration for video previews in seconds

// Parse command line arguments
const args = process.argv.slice(2);
const REGENERATE_THUMBNAILS = args.includes("--regenerate-thumbnails");
const WEB_COMPATIBLE_VIDEO_EXTS = [".mp4", ".webm", ".ogg"];
const VIDEO_EXTS = [
  ...WEB_COMPATIBLE_VIDEO_EXTS,
  ".mov",
  ".avi",
  ".mkv",
  ".flv",
  ".wmv",
];

async function fileExists(filePath) {
  try {
    await access(filePath, fs.constants.F_OK);
    return true;
  } catch (err) {
    return false;
  }
}

// Get video duration in seconds
async function getVideoDuration(inputPath) {
  try {
    const { stdout } = await execPromise(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${inputPath}"`
    );
    return parseFloat(stdout.trim());
  } catch (err) {
    console.error(`Error getting video duration: ${err.message}`);
    return null;
  }
}

// Check if FFmpeg is installed
async function checkFFmpeg() {
  try {
    await execPromise("ffmpeg -version");
    return true;
  } catch (err) {
    console.error(
      "FFmpeg is not installed. Please install FFmpeg to enable video conversion."
    );
    return false;
  }
}

// Convert video to web-compatible format
async function convertVideo(inputPath, outputPath) {
  // Create output directory if it doesn't exist
  const outputDir = path.dirname(outputPath);
  if (!(await fileExists(outputDir))) {
    await mkdir(outputDir, { recursive: true });
  }

  // Check if output already exists
  if (await fileExists(outputPath)) {
    console.log(`Video already converted: ${outputPath}`);
    return outputPath;
  }

  console.log(`Converting video: ${inputPath} to ${outputPath}`);

  try {
    // Convert to MP4 with H.264 codec, optimize for streaming
    await execPromise(
      `ffmpeg -i "${inputPath}" -c:v libx264 -crf 23 -preset fast -an -movflags faststart "${outputPath}"`
    );
    console.log(`Successfully converted: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error(`Error converting video: ${err.message}`);
    return null; // Return null on error
  }
}

async function createVideoPreview(inputPath, outputPath) {
  // Create output directory if it doesn't exist
  const outputDir = path.dirname(outputPath);
  if (!(await fileExists(outputDir))) {
    await mkdir(outputDir, { recursive: true });
  }

  console.log(`Creating video preview: ${inputPath} to ${outputPath}`);

  try {
    // Get video duration to calculate middle position
    const duration = await getVideoDuration(inputPath);
    let startTime = 0;

    if (duration && duration > VIDEO_PREVIEW_DURATION) {
      // Calculate start time to get the middle portion
      // If duration is long enough, start from the middle minus half the preview duration
      startTime = Math.max(0, duration / 2 - VIDEO_PREVIEW_DURATION / 2);
    }

    // Create a small, short preview video from the middle
    await execPromise(
      `ffmpeg -y -ss ${startTime} -i "${inputPath}" -t ${VIDEO_PREVIEW_DURATION} -vf "scale=-2:${VIDEO_PREVIEW_HEIGHT}" -c:v libx264 -crf 23 -preset fast -an -movflags faststart "${outputPath}"`
    );
    console.log(`Successfully created video preview: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error(`Error creating video preview: ${err.message}`);
    return null; // Return null on error
  }
}

// Recursively delete a directory and its contents
async function deleteDirectoryRecursive(dirPath) {
  if (!(await fileExists(dirPath))) {
    return;
  }

  try {
    const files = await readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const fileStats = await stat(filePath);

      if (fileStats.isDirectory()) {
        await deleteDirectoryRecursive(filePath);
      } else {
        await unlink(filePath);
        console.log(`Deleted file: ${filePath}`);
      }
    }

    await rmdir(dirPath);
    console.log(`Deleted directory: ${dirPath}`);
  } catch (err) {
    console.error(`Error deleting directory ${dirPath}: ${err.message}`);
  }
}

// Clean up files in output directory that no longer exist in source
async function cleanupOutputDirectory(srcDir, outputDir) {
  try {
    // Check if output directory exists
    if (!(await fileExists(outputDir))) {
      return; // Nothing to clean up
    }

    // Get all media files in source directory
    const srcFiles = await readdir(srcDir);
    const srcMediaFiles = srcFiles.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return (
        ([".jpg", ".jpeg", ".png", ".gif"].includes(ext) ||
          VIDEO_EXTS.includes(ext)) &&
        ext !== ".md"
      );
    });

    // Get base names of source media files (without extension)
    const srcBasenames = srcMediaFiles.map((file) => {
      return path.basename(file, path.extname(file));
    });

    // Get all files in output directory
    const outputFiles = await readdir(outputDir);

    // Check each output file to see if it should be deleted
    for (const outputFile of outputFiles) {
      const outputExt = path.extname(outputFile).toLowerCase();
      const outputBasename = path.basename(outputFile, outputExt);

      // Handle thumbnail files (.thumb.jpg)
      if (outputFile.endsWith(".thumb.jpg")) {
        const originalName = outputFile.replace(".thumb.jpg", "");
        if (!srcMediaFiles.includes(originalName)) {
          await unlink(path.join(outputDir, outputFile));
          console.log(`Deleted obsolete thumbnail: ${outputFile}`);
        }
        continue;
      }

      // Handle video files (.mp4) - these are previews using original filenames
      if (outputExt === ".mp4") {
        const hasOriginal = srcBasenames.includes(outputBasename);
        if (!hasOriginal) {
          await unlink(path.join(outputDir, outputFile));
          console.log(`Deleted obsolete video preview: ${outputFile}`);
        }
        continue;
      }

      // Handle other media files (images) - should not exist since we don't copy originals
      if ([".jpg", ".jpeg", ".png", ".gif"].includes(outputExt)) {
        // These shouldn't exist since we don't copy original images
        if (!srcMediaFiles.includes(outputFile)) {
          await unlink(path.join(outputDir, outputFile));
          console.log(`Deleted obsolete media file: ${outputFile}`);
        }
      }
    }
  } catch (err) {
    console.error(`Error cleaning up output directory: ${err.message}`);
  }
}

async function processShowcaseMedia(sourceDir, outputDir) {
  // Check if FFmpeg is installed
  const ffmpegAvailable = await checkFFmpeg();

  // Create output directory
  if (!(await fileExists(outputDir))) {
    await mkdir(outputDir, { recursive: true });
  }

  // Clean up files in output directory that no longer exist in source
  await cleanupOutputDirectory(sourceDir, outputDir);

  // Get all files in the source directory
  const files = await readdir(sourceDir);

  // Filter for media files (exclude markdown and other non-media files)
  const mediaFiles = files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return (
      ([".jpg", ".jpeg", ".png", ".gif"].includes(ext) ||
        VIDEO_EXTS.includes(ext)) &&
      ext !== ".md"
    );
  });

  console.log(`Found ${mediaFiles.length} media files to process`);

  // Process each media file
  for (const file of mediaFiles) {
    const ext = path.extname(file).toLowerCase();
    const filePath = path.join(sourceDir, file);

    // Process images
    if ([".jpg", ".jpeg", ".png", ".gif"].includes(ext)) {
      // Create thumbnail for image
      const thumbnailFilename = `${file}.thumb.jpg`;
      const thumbnailPath = path.join(outputDir, thumbnailFilename);

      try {
        // Check if thumbnail already exists or if force regeneration is enabled
        const thumbnailExists = await fileExists(thumbnailPath);
        const shouldGenerateThumbnail =
          !thumbnailExists || REGENERATE_THUMBNAILS;

        // Only create thumbnail if it doesn't exist or regeneration is forced
        if (shouldGenerateThumbnail) {
          if (REGENERATE_THUMBNAILS && thumbnailExists) {
            console.log(`Regenerating thumbnail for ${filePath}`);
          } else {
            console.log(`Creating thumbnail for ${filePath}`);
          }
          // Process image to create high quality thumbnail while preserving aspect ratio
          await sharp(filePath)
            .resize({
              width: THUMBNAIL_SIZE,
              height: THUMBNAIL_SIZE,
              fit: sharp.fit.inside, // Preserve aspect ratio
              withoutEnlargement: true, // Don't enlarge small images
            })
            .jpeg({
              quality: 85, // Higher quality (default is 80)
              progressive: true, // Create progressive JPEGs for faster perceived loading
              optimizeScans: true, // Optimize progressive scans for web
              mozjpeg: true, // Use mozjpeg optimizations when available
              trellisQuantisation: true, // Apply trellis quantisation for better quality/size ratio
            })
            .toFile(thumbnailPath);
        }

        console.log(`Processed image: ${file}`);
      } catch (err) {
        console.error(`Error processing image ${filePath}: ${err.message}`);
      }
    }
    // Process videos
    else if (VIDEO_EXTS.includes(ext)) {
      // Create video preview for showcase display using original filename
      if (ffmpegAvailable) {
        const previewFilename = `${path.basename(file, ext)}.mp4`;
        const previewPath = path.join(outputDir, previewFilename);

        // Check if preview already exists or if force regeneration is enabled
        const previewExists = await fileExists(previewPath);
        const shouldGeneratePreview = !previewExists || REGENERATE_THUMBNAILS;

        if (shouldGeneratePreview) {
          await createVideoPreview(filePath, previewPath);
        }
      }

      console.log(`Processed video: ${file}`);
    }
  }

  console.log(`Showcase media processing complete! Output directory: ${outputDir}`);
}

// Main execution
async function main() {
  const sourceDir = "src/showcase";
  const outputDir = "output/showcase";

  console.log(`Processing showcase media from ${sourceDir} to ${outputDir}...`);

  try {
    await processShowcaseMedia(sourceDir, outputDir);
  } catch (err) {
    console.error("Error processing showcase media:", err);
    process.exit(1);
  }
}

// Execute the processing
main().catch((err) => {
  console.error("Error in main:", err);
  process.exit(1);
});