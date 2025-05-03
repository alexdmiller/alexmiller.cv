const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { exec } = require("child_process");
const marked = require("marked"); // For markdown parsing
const sharp = require("sharp"); // For image processing

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const execPromise = promisify(exec);

// Configuration
const THUMBNAIL_SIZE = 400; // Max dimension of thumbnails in pixels
const OUTPUT_DIR = "output/gallery"; // Main output directory
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

async function generateGallery(sourceDir, outputFile) {
  // Check if FFmpeg is installed
  const ffmpegAvailable = await checkFFmpeg();

  // Create output directory for HTML file
  const outputDir = path.dirname(outputFile);
  if (!(await fileExists(outputDir))) {
    await mkdir(outputDir, { recursive: true });
  }

  // Get all directories in the source folder
  const items = await readdir(sourceDir);
  const directories = [];

  // Get directories and their stats
  for (const item of items) {
    const itemPath = path.join(sourceDir, item);
    const itemStat = await stat(itemPath);

    if (itemStat.isDirectory()) {
      directories.push({
        name: item,
        path: itemPath,
        modifiedTime: itemStat.mtime,
      });
    }
  }

  // Sort directories by modified time
  directories.sort((a, b) => b.modifiedTime - a.modifiedTime);

  // Start building HTML
  let html = ``;

  // Process each directory
  for (const dir of directories) {
    html += `<section id="${dir.name}">`;

    // Check if markdown file exists
    const files = await readdir(dir.path);
    const mdFile = files.find(
      (file) => path.extname(file).toLowerCase() === ".md"
    );

    if (mdFile) {
      const mdContent = await readFile(path.join(dir.path, mdFile), "utf8");
      const htmlContent = marked.parse(mdContent);
      html += `<div class="description">${htmlContent}</div>`;
    }

    // Add images and videos
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const filePath = path.join(sourceDir, dir.name, file);

      // Process images
      if ([".jpg", ".jpeg", ".png", ".gif"].includes(ext)) {
        // Create thumbnail for image
        const thumbnailFilename = `${file}.thumb.jpg`;
        const thumbnailPath = path.join(
          OUTPUT_DIR,
          dir.name,
          thumbnailFilename
        );

        try {
          // Ensure directory exists
          await mkdir(path.dirname(thumbnailPath), { recursive: true });

          // Check if thumbnail already exists
          const thumbnailExists = await fileExists(thumbnailPath);

          // Only create thumbnail if it doesn't exist
          if (!thumbnailExists) {
            console.log(`Creating thumbnail for ${filePath}`);
            // Process image to create thumbnail while preserving aspect ratio
            await sharp(filePath)
              .resize({
                width: THUMBNAIL_SIZE,
                fit: sharp.fit.inside, // Preserve aspect ratio
                withoutEnlargement: true, // Don't enlarge small images
              })
              .toFile(thumbnailPath);
          }

          // Copy original file to output directory
          const outputImagePath = path.join(OUTPUT_DIR, dir.name, file);
          await fs.promises.copyFile(filePath, outputImagePath);

          // Add image with thumbnail that links to original
          html += `
            <div class="gallery-item">
              <a href="${dir.name}/${file}" target="_blank">
                <img src="${dir.name}/${thumbnailFilename}" alt="${file}">
              </a>
            </div>`;
        } catch (err) {
          console.error(`Error with thumbnail for ${filePath}: ${err.message}`);
          // Fallback to original image if thumbnail creation fails
          html += `<div class="gallery-item"><img src="${dir.name}/${file}" alt="${file}"></div>`;
        }
      }
      // Process videos
      else if (VIDEO_EXTS.includes(ext)) {
        // Check if video needs conversion
        let videoSrc = `${dir.name}/${file}`;
        let videoType = `video/${ext.substring(1)}`;

        // If video is not web-compatible and FFmpeg is available, convert it
        if (!WEB_COMPATIBLE_VIDEO_EXTS.includes(ext) && ffmpegAvailable) {
          const outputFilename = `${path.basename(file, ext)}.mp4`;
          const outputPath = path.join(OUTPUT_DIR, dir.name, outputFilename);

          const convertedPath = await convertVideo(filePath, outputPath);
          if (convertedPath) {
            videoSrc = `${dir.name}/${outputFilename}`;
            videoType = "video/mp4";
          }
        } else {
          // Copy original video to output directory if it's web-compatible
          const outputVideoPath = path.join(OUTPUT_DIR, dir.name, file);
          await mkdir(path.dirname(outputVideoPath), { recursive: true });
          await fs.promises.copyFile(filePath, outputVideoPath);
        }

        html += `
          <div class="gallery-item">
            <video autoplay loop muted playsinline preload="metadata">
              <source src="${videoSrc}" type="${videoType}">
              Your browser does not support the video tag.
            </video>
          </div>`;
      }
    }

    html += `</section>`;
  }

  // Main function
  try {
    const templatePath = path.resolve(process.cwd(), "src/template.html");
    let templateHtml;

    try {
      templateHtml = fs.readFileSync(templatePath, "utf8");
    } catch (error) {
      console.error(`Error reading template file: ${error.message}`);
      process.exit(1);
    }

    // Replace content placeholder with generated content
    const finalHtml = templateHtml.replace("{content}", html);

    // Output the HTML file
    await writeFile(outputFile, finalHtml);
    console.log(`Gallery generated at ${outputFile}`);
  } catch (error) {
    console.error(`Error processing template: ${error.message}`);
    process.exit(1);
  }
}

// Run the function
const sourceDirectory = "src/gallery"; // Source directory containing all media
const outputFile = "output/gallery/index.html"; // Output HTML file

generateGallery(sourceDirectory, outputFile).catch((err) => {
  console.error("Error generating gallery:", err);
});
