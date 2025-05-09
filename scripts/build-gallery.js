// Configuration
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { exec } = require("child_process");
const marked = require("marked"); // For markdown parsing
const sharp = require("sharp"); // For image processing
const yaml = require("js-yaml"); // For parsing YAML files

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

// Parse command line arguments
const args = process.argv.slice(2);
const REGENERATE_THUMBNAILS = args.includes("--regenerate-thumbnails");
const OUTPUT_BASE_DIR = "output/gallery"; // Base output directory
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

// Read and parse description.yaml if it exists
async function getDirectoryInfo(dirPath) {
  const descriptionFile = path.join(dirPath, "description.yaml");

  try {
    // Check if description.yaml exists
    if (await fileExists(descriptionFile)) {
      const yamlContent = await readFile(descriptionFile, "utf8");
      const data = yaml.load(yamlContent);
      return {
        title: data.title || path.basename(dirPath),
        description: data.description || "",
      };
    }
  } catch (err) {
    console.error(
      `Error reading description.yaml in ${dirPath}: ${err.message}`
    );
  }

  // Default to directory name if no valid description.yaml
  return {
    title: path.basename(dirPath),
    description: "",
  };
}

// Generate individual HTML page for a media file
async function generateMediaPage(mediaInfo, dirName, galleryType, outputDir) {
  const {
    fileName,
    mediaPath,
    mediaType,
    prev,
    next,
    dirTitle,
    dirDescription,
  } = mediaInfo;

  // Create content HTML for the media page
  let mediaContent = "";

  mediaContent += `<div class="row">`;

  mediaContent += `<div class="previous">`;
  if (prev) {
    mediaContent += `
    <a href="${prev}">Previous</a>`;
  }
  mediaContent += `</div>`;

  mediaContent += `<div class="media-container">`;

  if (galleryType === "in-progress") {
    mediaContent += `
    <div class="back-to-gallery"><a href="../index.html" class="back">Back to in-progress gallery</a></div>`;
  } else {
    mediaContent += `
    <div class="back-to-gallery"><a href="../index.html" class="back">Back to gallery</a></div>`;
  }

  mediaContent += `<div class="inner-media-container">`;

  // Add the appropriate media element
  if (mediaType === "image") {
    mediaContent += `
    <img src="${mediaPath}" alt="${fileName}">`;
  } else if (mediaType === "video") {
    mediaContent += `
    <video controls>
      <source src="${mediaPath}">
      Your browser does not support the video tag.
    </video>`;
  }

  mediaContent += `</div>`;

  // Add the directory title and description below the media
  if (dirTitle || dirDescription) {
    mediaContent += `
    <div class="media-description">`;

    if (dirTitle) {
      mediaContent += `<h2>${dirTitle}</h2>`;
    }

    if (dirDescription) {
      mediaContent += marked.parse(dirDescription);
    }

    mediaContent += `</div>`;
  }

  mediaContent += `</div>`;

  mediaContent += `<div class="next">`;
  if (next) {
    mediaContent += `
    <a href="${next}">Next</a>`;
  }
  mediaContent += `</div>`;

  mediaContent += `</div>`;

  // Get the template HTML
  const templatePath = path.resolve(process.cwd(), "src/template.html");
  let templateHtml;

  try {
    templateHtml = fs.readFileSync(templatePath, "utf8");
  } catch (error) {
    console.error(`Error reading template file: ${error.message}`);
    return null;
  }

  // Insert the media content into the template
  const finalHtml = templateHtml.replace("{content}", mediaContent);

  // Write the HTML file
  const outputPath = path.join(outputDir, `${fileName}.html`);
  try {
    await writeFile(outputPath, finalHtml);
    console.log(`Media page generated at ${outputPath}`);

    return `${fileName}.html`;
  } catch (error) {
    console.error(`Error writing media page: ${error.message}`);
    return null;
  }
}

// NEW FUNCTION: Recursively delete a directory and its contents
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

// NEW FUNCTION: Delete files in output that no longer exist in source
async function cleanupOutputDirectory(srcDir, outputDir) {
  try {
    // Check if output directory exists
    if (!(await fileExists(outputDir))) {
      return; // Nothing to clean up
    }

    // Get all directories in source
    const srcItems = await readdir(srcDir);
    const srcDirs = [];

    for (const item of srcItems) {
      const itemPath = path.join(srcDir, item);
      const itemStat = await stat(itemPath);

      if (itemStat.isDirectory()) {
        srcDirs.push(item);
      }
    }

    // Get all directories in output
    const outputItems = await readdir(outputDir);
    const outputDirs = [];

    for (const item of outputItems) {
      const itemPath = path.join(outputDir, item);
      const itemStat = await stat(itemPath);

      if (itemStat.isDirectory()) {
        outputDirs.push(item);
      }
    }

    // Delete output directories that no longer exist in source
    for (const outputDir of outputDirs) {
      if (!srcDirs.includes(outputDir)) {
        await deleteDirectoryRecursive(path.join(outputDir, outputDir));
        console.log(
          `Deleted directory that no longer exists in source: ${outputDir}`
        );
      }
    }

    // For each directory that exists in both source and output, check for files to delete
    for (const dir of srcDirs) {
      const srcDirPath = path.join(srcDir, dir);
      const outputDirPath = path.join(outputDir, dir);

      // Skip if output directory doesn't exist
      if (!(await fileExists(outputDirPath))) {
        continue;
      }

      // Get all media files in source directory
      const srcFiles = await readdir(srcDirPath);
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
      const outputFiles = await readdir(outputDirPath);

      // Check each output file to see if it should be deleted
      for (const outputFile of outputFiles) {
        const outputExt = path.extname(outputFile).toLowerCase();
        const outputBasename = path.basename(outputFile, outputExt);

        // Handle thumbnail files (.thumb.jpg)
        if (outputFile.endsWith(".thumb.jpg")) {
          const originalName = outputFile.replace(".thumb.jpg", "");
          if (!srcMediaFiles.includes(originalName)) {
            await unlink(path.join(outputDirPath, outputFile));
            console.log(`Deleted obsolete thumbnail: ${outputFile}`);
          }
          continue;
        }

        // Handle HTML files
        if (outputExt === ".html") {
          // Check if corresponding source media file exists
          if (!srcBasenames.includes(outputBasename)) {
            await unlink(path.join(outputDirPath, outputFile));
            console.log(`Deleted obsolete HTML file: ${outputFile}`);
          }
          continue;
        }

        // Handle media files
        if (
          [".jpg", ".jpeg", ".png", ".gif"].includes(outputExt) ||
          WEB_COMPATIBLE_VIDEO_EXTS.includes(outputExt)
        ) {
          // Check if this is a converted video (check for original in source)
          const isConverted =
            WEB_COMPATIBLE_VIDEO_EXTS.includes(outputExt) &&
            !srcMediaFiles.includes(outputFile);

          // If it's a converted video, check if the base filename exists with any video extension
          if (isConverted) {
            const originalExists = srcBasenames.includes(outputBasename);
            if (!originalExists) {
              await unlink(path.join(outputDirPath, outputFile));
              console.log(`Deleted obsolete converted video: ${outputFile}`);
            }
          }
          // For regular media files, check if the exact file exists in source
          else if (!srcMediaFiles.includes(outputFile)) {
            await unlink(path.join(outputDirPath, outputFile));
            console.log(`Deleted obsolete media file: ${outputFile}`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error cleaning up output directory: ${err.message}`);
  }
}

async function generateGallery(sourceDir, outputDir, outputFile) {
  // Check if FFmpeg is installed
  const ffmpegAvailable = await checkFFmpeg();

  // Create output directory for HTML file
  const outputFileDir = path.dirname(outputFile);
  if (!(await fileExists(outputFileDir))) {
    await mkdir(outputFileDir, { recursive: true });
  }

  // Clean up files in output directory that no longer exist in source
  await cleanupOutputDirectory(sourceDir, outputDir);

  // Start building HTML
  let html = ``;

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

  // Prepare a flat list of all media files across all sections for cross-section navigation
  let allMediaItems = [];

  // First pass: Collect all media items across all sections
  for (const dir of directories) {
    const files = await readdir(dir.path);

    // Filter for media files (exclude markdown)
    const mediaFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return (
        ([".jpg", ".jpeg", ".png", ".gif"].includes(ext) ||
          VIDEO_EXTS.includes(ext)) &&
        ext !== ".md"
      );
    });

    // Sort media files
    mediaFiles.sort();

    // Get directory info from description.yaml
    const dirInfo = await getDirectoryInfo(dir.path);

    // Add each media file to the overall list
    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i];
      const ext = path.extname(file).toLowerCase();
      const baseName = path.basename(file, ext);
      const htmlFileName = `${baseName}.html`;

      allMediaItems.push({
        sectionDir: dir.name,
        index: allMediaItems.length,
        fileName: baseName,
        originalFile: file,
        extension: ext,
        htmlFile: htmlFileName,
        dirTitle: dirInfo.title,
        dirDescription: dirInfo.description,
      });
    }
  }

  // Set up navigation links for all media items across all sections
  for (let i = 0; i < allMediaItems.length; i++) {
    const item = allMediaItems[i];

    // Set up cross-section navigation links
    if (i > 0) {
      const prevItem = allMediaItems[i - 1];
      item.prev = `../${prevItem.sectionDir}/${prevItem.htmlFile}`;
    } else {
      item.prev = null;
    }

    if (i < allMediaItems.length - 1) {
      const nextItem = allMediaItems[i + 1];
      item.next = `../${nextItem.sectionDir}/${nextItem.htmlFile}`;
    } else {
      item.next = null;
    }
  }

  // Process each directory section
  for (const dir of directories) {
    // Get directory info from description.yaml if available
    const dirInfo = await getDirectoryInfo(dir.path);

    // Create a section for this directory
    html += `<section class="gallery-section" id="${dir.name}">`;

    html += `<div class="description">`;
    html += `<h2>${dirInfo.title}</h2>`;

    if (dirInfo.description) {
      html += marked.parse(dirInfo.description);
    }

    html += `</div>`;

    html += `<div class="thumbnails">`;

    // Process all files in the directory
    const files = await readdir(dir.path);

    // Filter for media files (exclude markdown)
    const mediaFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return (
        ([".jpg", ".jpeg", ".png", ".gif"].includes(ext) ||
          VIDEO_EXTS.includes(ext)) &&
        ext !== ".md"
      );
    });

    // Sort media files for consistent navigation
    mediaFiles.sort();

    // Get the media items for this section
    const sectionMediaItems = allMediaItems.filter(
      (item) => item.sectionDir === dir.name
    );

    // Process each media file in this section
    for (let i = 0; i < sectionMediaItems.length; i++) {
      const item = sectionMediaItems[i];
      const file = item.originalFile;
      const ext = item.extension;
      const filePath = path.join(sourceDir, dir.name, file);

      // Process images
      if ([".jpg", ".jpeg", ".png", ".gif"].includes(ext)) {
        // Create thumbnail for image
        const thumbnailFilename = `${file}.thumb.jpg`;
        const thumbnailPath = path.join(outputDir, dir.name, thumbnailFilename);

        try {
          // Ensure directory exists
          await mkdir(path.dirname(thumbnailPath), { recursive: true });

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

          // Copy original file to output directory
          const outputImagePath = path.join(outputDir, dir.name, file);
          await fs.promises.copyFile(filePath, outputImagePath);

          // Generate the media page
          const mediaPageInfo = {
            fileName: item.fileName,
            mediaPath: file,
            mediaType: "image",
            prev: item.prev,
            next: item.next,
            dirTitle: item.dirTitle,
            dirDescription: item.dirDescription,
          };

          await generateMediaPage(
            mediaPageInfo,
            dir.name,
            path.basename(outputDir),
            path.join(outputDir, dir.name)
          );

          // Add image with thumbnail that links to media page (not directly to image)
          html += `
            <div class="gallery-item">
              <a href="${dir.name}/${item.htmlFile}">
                <img src="${dir.name}/${thumbnailFilename}" alt="${file}">
              </a>
            </div>`;
        } catch (err) {
          console.error(`Error with thumbnail for ${filePath}: ${err.message}`);
          // Fallback to direct link if thumbnail creation fails
          html += `<div class="gallery-item"><a href="${dir.name}/${file}">${file}</a></div>`;
        }
      }
      // Process videos
      else if (VIDEO_EXTS.includes(ext)) {
        // Check if video needs conversion
        let videoSrc = file; // Use relative path
        let videoType = `video/${ext.substring(1)}`;
        let finalVideoSrc = videoSrc;

        // If video is not web-compatible and FFmpeg is available, convert it
        if (!WEB_COMPATIBLE_VIDEO_EXTS.includes(ext) && ffmpegAvailable) {
          const outputFilename = `${path.basename(file, ext)}.mp4`;
          const outputPath = path.join(outputDir, dir.name, outputFilename);

          const convertedPath = await convertVideo(filePath, outputPath);
          if (convertedPath) {
            finalVideoSrc = outputFilename;
            videoType = "video/mp4";
          }
        } else {
          // Copy original video to output directory if it's web-compatible
          const outputVideoPath = path.join(outputDir, dir.name, file);
          await mkdir(path.dirname(outputVideoPath), { recursive: true });
          await fs.promises.copyFile(filePath, outputVideoPath);
        }

        // Generate the media page
        const mediaPageInfo = {
          fileName: item.fileName,
          mediaPath: finalVideoSrc,
          mediaType: "video",
          prev: item.prev,
          next: item.next,
          dirTitle: item.dirTitle,
          dirDescription: item.dirDescription,
        };

        await generateMediaPage(
          mediaPageInfo,
          dir.name,
          path.basename(outputDir),
          path.join(outputDir, dir.name)
        );

        // Add video thumbnail that links to media page
        html += `
          <div class="gallery-item">
            <a href="${dir.name}/${item.htmlFile}">
              <video autoplay loop muted playsinline preload="metadata">
                <source src="${dir.name}/${finalVideoSrc}" type="${videoType}">
                Your browser does not support the video tag.
              </video>
            </a>
          </div>`;
      }
    }

    html += `</div>`;
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

// Run the function for both directories
async function generateBothGalleries() {
  const galleries = [
    {
      sourceDir: "src/gallery/finished",
      outputDir: path.join(OUTPUT_BASE_DIR, "finished"),
      outputFile: path.join(OUTPUT_BASE_DIR, "finished", "index.html"),
    },
    {
      sourceDir: "src/gallery/in-progress",
      outputDir: path.join(OUTPUT_BASE_DIR, "in-progress"),
      outputFile: path.join(OUTPUT_BASE_DIR, "in-progress", "index.html"),
    },
  ];

  for (const gallery of galleries) {
    console.log(`\nGenerating gallery for ${gallery.sourceDir}...`);
    try {
      await generateGallery(
        gallery.sourceDir,
        gallery.outputDir,
        gallery.outputFile
      );
    } catch (err) {
      console.error(`Error generating gallery for ${gallery.sourceDir}:`, err);
    }
  }
}

// Execute the generation
generateBothGalleries().catch((err) => {
  console.error("Error generating galleries:", err);
});
