import yaml
import os
import re

def slugify(text):
    """Convert title to a slug suitable for directory names."""
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Convert to lowercase and replace spaces/special chars with hyphens
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text

def create_project_markdown(project_data):
    """Generate markdown content from project data."""
    lines = ["---"]
    
    # Add all metadata fields
    for key, value in project_data.items():
        if key == 'collaborators' and isinstance(value, list):
            lines.append(f"{key}:")
            for collab in value:
                lines.append(f"  - {collab}")
        else:
            lines.append(f"{key}: {value}")
    
    lines.append("---")
    lines.append("")
    
    return "\n".join(lines)

# Read the YAML file
with open('cv.yaml', 'r') as file:
    data = yaml.safe_load(file)

# Create projects directory if it doesn't exist
os.makedirs('projects', exist_ok=True)

for category in data:
    print(category)

    # Process each project entry
    for project in data[category]:
        print(project)
        slug = slugify(project['title'])
        # Create project directory
        project_dir = os.path.join('projects', category, slug)
        os.makedirs(project_dir, exist_ok=True)
        
        # Generate markdown content
        markdown_content = create_project_markdown(project)
        
        # Write index.md file
        index_path = os.path.join(project_dir, 'index.yaml')
        with open(index_path, 'w') as f:
            f.write(markdown_content)
        
        print(f"Created: {project_dir}/index.yaml")

    print("\nDone! All project directories and index.md files have been created.")
