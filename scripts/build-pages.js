#!/usr/bin/env node
/**
 * Node.js script to render multiple HTML pages using template.html
 * Usage: node build-pages.js
 */
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const writeFile = promisify(fs.writeFile);

// List of pages to build - add new pages here
const PAGES = [
  {
    inputFile: "src/reel.html",
    outputFile: "output/reel.html",
  },
  {
    inputFile: "src/index.html",
    outputFile: "output/index.html",
  },
];

const templateFile = "src/template.html";

async function buildPage(pageConfig) {
  const { inputFile, outputFile } = pageConfig;

  try {
    // Read the page content
    let pageContent;
    try {
      pageContent = fs.readFileSync(inputFile, "utf8");
    } catch (error) {
      console.error(`Error reading page file ${inputFile}: ${error.message}`);
      return false;
    }

    // Read the template file
    let templateHtml;
    try {
      templateHtml = fs.readFileSync(templateFile, "utf8");
    } catch (error) {
      console.error(`Error reading template file: ${error.message}`);
      return false;
    }

    // Replace content placeholder with page content
    const finalHtml = templateHtml.replace("{content}", pageContent);

    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await writeFile(outputFile, finalHtml);
    console.log(`Page generated: ${inputFile} -> ${outputFile}`);
    return true;
  } catch (error) {
    console.error(`Error processing page ${inputFile}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`Building ${PAGES.length} page(s)...`);

  let successCount = 0;
  let errorCount = 0;

  for (const pageConfig of PAGES) {
    const success = await buildPage(pageConfig);
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
  }

  console.log(`Pages built successfully: ${successCount}`);
  if (errorCount > 0) {
    console.log(`Pages with errors: ${errorCount}`);
    process.exit(1);
  }
}

main();
