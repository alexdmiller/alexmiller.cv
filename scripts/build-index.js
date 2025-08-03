#!/usr/bin/env node
/**
 * Node.js script to render index.html using template.html
 * Usage: node build-index.js
 */
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const writeFile = promisify(fs.writeFile);

const inputFile = "src/index.html";
const templateFile = "src/template.html";
const outputFile = "output/index.html";

async function main() {
  try {
    // Read the index.html content
    let indexContent;
    try {
      indexContent = fs.readFileSync(inputFile, "utf8");
    } catch (error) {
      console.error(`Error reading index file: ${error.message}`);
      process.exit(1);
    }

    // Read the template file
    let templateHtml;
    try {
      templateHtml = fs.readFileSync(templateFile, "utf8");
    } catch (error) {
      console.error(`Error reading template file: ${error.message}`);
      process.exit(1);
    }

    // Replace content placeholder with index content
    const finalHtml = templateHtml.replace("{content}", indexContent);

    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await writeFile(outputFile, finalHtml);
    console.log(`Index page generated at ${outputFile}`);
  } catch (error) {
    console.error(`Error processing index: ${error.message}`);
    process.exit(1);
  }
}

main();