#!/usr/bin/env node
/**
 * Node.js script to parse YAML and output HTML with modified column order
 * Usage: node yaml-to-html.js input.yaml > output.html
 *
 * Requires: npm install js-yaml
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { promisify } = require("util");

const writeFile = promisify(fs.writeFile);

// Check if input file was provided
const inputFile = "src/cv.yaml";
const outputFile = "output/index.html";

// Read the input file
let yamlContent;
try {
  yamlContent = fs.readFileSync(inputFile, "utf8");
} catch (error) {
  console.error(`Error reading file: ${error.message}`);
  process.exit(1);
}
// Convert Markdown links to HTML
function convertMarkdownLinks(text) {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}
// Generate HTML from the parsed data
function generateHtml(data) {
  let html = "";
  // Process each section
  Object.keys(data).forEach((section) => {
    html += `<section>
 <h2><span>${section.charAt(0).toUpperCase() + section.slice(1)}</span></h2>
`;
    // Process each item in the section
    data[section].forEach((item) => {
      html += ` <div class="item">
`;
      // Date (first column)
      if (item.date) {
        html += ` <div class="item-date"><span>${item.date}</span></div>
`;
      } else {
        html += ` <div class="item-date"></div>
`;
      }
      // Title (second column)
      html += ` <div class="item-title">`;
      if (item.url) {
        html += `<span><a href="${item.url}">${item.title}</a></span>`;
      } else if (item.title) {
        html += `<span>${item.title}</span>`;
      }
      html += `</div>
`;
      // Content (third column)
      if (item.description) {
        html += ` <div class="item-details"><span>${convertMarkdownLinks(
          item.description
        )}</span></div>
`;
      } else {
        html += ` <div class="item-details"></div>
`;
      }
      // Location (fourth column)
      if (item.location) {
        html += ` <div class="item-location"><span>${convertMarkdownLinks(
          item.location
        )}</span></div>
`;
      } else {
        html += ` <div class="item-location"></div>
`;
      }
      // Collaborators (fifth column)
      if (item.collaborators && item.collaborators.length > 0) {
        html += ` <div class="collaborators"><span>with ${item.collaborators.join(
          ", "
        )}</span></div>
`;
      } else {
        html += ` <div class="collaborators"></div>
`;
      }
      html += ` </div>
`;
    });
    html += ` </section>
`;
  });
  return html;
}

async function main() {
  // Main function
  try {
    // Parse YAML using js-yaml library
    const parsedData = yaml.load(yamlContent);
    const contentHtml = generateHtml(parsedData);
    // Read the template file
    const templatePath = path.resolve(process.cwd(), "src/template.html");
    let templateHtml;
    try {
      templateHtml = fs.readFileSync(templatePath, "utf8");
    } catch (error) {
      console.error(`Error reading template file: ${error.message}`);
      process.exit(1);
    }
    // Replace content placeholder with generated content
    const finalHtml = templateHtml.replace("{content}", contentHtml);
    await writeFile(outputFile, finalHtml);
    console.log(`CV generated at ${outputFile}`);
  } catch (error) {
    console.error(`Error processing YAML: ${error.message}`);
    process.exit(1);
  }
}

main();
