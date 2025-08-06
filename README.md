# Brand Switcher 🎨

Open-source CLI tool for managing white-label application resources. Easily switch between different brands/flavors of your application with a single command.

## Features ✨

- **🔄 Easy Brand Switching** - Switch between different brands with a single command
- **✅ Configuration Validation** - Robust validation using Joi schema
- **🔒 Git Integration** - Automatic .gitignore management to prevent committing brand files
- **💾 State Management** - Tracks current brand and original file hashes
- **🔙 Rollback Support** - Easily reset to original state
- **📁 Flexible Mapping** - Support for files and directories
- **🎯 Interactive Mode** - User-friendly interactive brand selection
- **🛡️ Safe Operations** - Automatic backup of original files

## Installation 📦

### Global Installation

```bash
npm install -g brand-switcher
```

### Local Installation

```bash
npm install brand-switcher --save-dev
```

Or clone the repository:

```bash
git clone https://github.com/yourusername/brand-switcher.git
cd brand-switcher
npm install
npm link  # Make the command available globally
```

## Quick Start 🚀

### 1. Initialize Brand Switcher in your project

```bash
brand-switcher init
```

This will create:
- `brand-config.json` - Main configuration file
- `brands/` directory - Where brand assets are stored
- Example brand structure
- Updated `.gitignore` with brand files

### 2. Configure your brands

Edit `brand-config.json` to match your project structure:

```json
{
  "version": "1.0.0",
  "projectRoot": "./",
  "brands": {
    "my-brand": {
      "displayName": "My Brand",
      "description": "Custom brand configuration",
      "active": true
    }
  },
  "mappings": [
    {
      "source": "assets/logo.png",
      "target": "src/assets/logo.png",
      "type": "file",
      "required": true
    }
  ]
}
```

### 3. Add brand assets

Create your brand structure:

```
brands/
├── my-brand/
│   ├── assets/
│   │   └── logo.png
│   ├── config/
│   │   ├── app.config.json
│   │   └── theme.json
│   └── styles/
│       └── brand.css
```

### 4. Switch to a brand

```bash
brand-switcher switch my-brand
```

## Commands 📝

### `brand-switcher init`
Initialize Brand Switcher in current directory.

### `brand-switcher switch <brand>`
Switch to a specific brand.

```bash
brand-switcher switch brand-a
```

### `brand-switcher switch`
Interactive brand selection (no arguments).

```bash
brand-switcher switch
# Will show a list of available brands to choose from
```

### `brand-switcher reset`
Reset to original state and remove all brand customizations.

```bash
brand-switcher reset
```

### `brand-switcher status`
Show current brand status and modified files.

```bash
brand-switcher status
```

### `brand-switcher validate`
Validate configuration and all brand structures.

```bash
brand-switcher validate
```

## Configuration Structure 📋

### Main Configuration (`brand-config.json`)

```json
{
  "version": "1.0.0",
  "projectRoot": "./",
  "brands": {
    "brand-name": {
      "displayName": "Display Name",
      "description": "Brand description",
      "active": true
    }
  },
  "mappings": [
    {
      "source": "relative/path/in/brand",
      "target": "relative/path/in/project",
      "type": "file|directory",
      "required": true|false,
      "description": "What this mapping does"
    }
  ],
  "requiredStructure": {
    "files": ["required/file.ext"],
    "directories": ["required/directory"]
  }
}
```

### Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Configuration version |
| `projectRoot` | string | Root directory of your project (default: "./") |
| `brands` | object | Brand definitions |
| `brands.[name].displayName` | string | Human-readable brand name |
| `brands.[name].description` | string | Brand description (optional) |
| `brands.[name].active` | boolean | Whether brand can be activated |
| `mappings` | array | File/directory mappings |
| `mappings[].source` | string | Path in brand directory |
| `mappings[].target` | string | Path in project |
| `mappings[].type` | string | "file" or "directory" |
| `mappings[].required` | boolean | Whether this mapping is required |
| `mappings[].description` | string | Mapping description (optional) |
| `requiredStructure` | object | Required brand structure |
| `requiredStructure.files` | array | Required files in each brand |
| `requiredStructure.directories` | array | Required directories in each brand |

## Brand Directory Structure 📁

Each brand should follow this structure:

```
brands/
├── brand-name/
│   ├── assets/           # Images, logos, icons
│   │   ├── logo.png
│   │   └── favicon.ico
│   ├── config/          # Configuration files
│   │   ├── app.config.json
│   │   └── theme.json
│   ├── styles/          # CSS/SCSS files
│   │   └── brand.css
│   ├── locales/         # Translations
│   │   ├── en.json
│   │   └── pl.json
│   └── fonts/           # Font files
│       └── custom-font.woff2
```

## How It Works 🔧

1. **Validation** - Validates configuration and brand structure
2. **Backup** - Creates backup of original files (stored in `.brand-backup/`)
3. **File Hashing** - Stores SHA256 hashes of original files
4. **Apply Brand** - Copies brand files to project locations
5. **State Tracking** - Saves current state in `.brand-state.json`
6. **Git Integration** - Updates `.gitignore` to exclude brand files

## Git Integration 🔐

Brand Switcher automatically manages your `.gitignore` file to prevent committing brand-specific files:

- Adds `.brand-state.json` to gitignore
- Adds `.brand-backup/` directory to gitignore
- Adds all active brand file paths to gitignore
- Maintains separation with marker comment

### Pre-commit Hook (Optional)

Add this Git hook to prevent committing with active brand:

```bash
#!/bin/sh
# .git/hooks/pre-commit

if [ -f .brand-state.json ]; then
  CURRENT_BRAND=$(grep '"currentBrand"' .brand-state.json | cut -d'"' -f4)
  if [ ! -z "$CURRENT_BRAND" ] && [ "$CURRENT_BRAND" != "null" ]; then
    echo "Error: Cannot commit with active brand: $CURRENT_BRAND"
    echo