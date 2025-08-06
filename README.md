# Flavor Switcher 🎨

Open-source CLI tool for managing white-label application resources. Easily switch between different flavors of your application with a single command.

## Features ✨

- **🔄 Easy Flavor Switching** - Switch between different flavors with a single command
- **✅ Configuration Validation** - Robust validation using Joi schema
- **🔒 Git Integration** - Automatic .gitignore management to prevent committing flavor files
- **💾 State Management** - Tracks current flavor and original file hashes
- **🔙 Rollback Support** - Easily reset to original state
- **📁 Flexible Mapping** - Support for files and directories
- **🎯 Interactive Mode** - User-friendly interactive brand selection
- **🛡️ Safe Operations** - Automatic backup of original files

## Installation 📦

### Global Installation

```bash
npm install -g flavor-switcher
```

### Local Installation

```bash
npm install flavor-switcher --save-dev
```

Or clone the repository:

```bash
git clone https://github.com/yourusername/flavor-switcher.git
cd flavor-switcher
npm install
npm link  # Make the command available globally
```

## Quick Start 🚀

### 1. Initialize Flavor Switcher in your project

```bash
flavor-switcher init
```

This will create:
- `flavor-config.json` - Main configuration file
- `flavors/` directory - Where flavor assets are stored
- Example flavor structure
- Updated `.gitignore` with flavor files

### 2. Configure your flavors

Edit `flavor-config.json` to match your project structure:

```json
{
  "version": "1.0.0",
  "projectRoot": "./",
  "flavors": {
    "my-flavor": {
      "displayName": "My Flavor",
      "description": "Custom flavor configuration",
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

### 3. Add flavor assets

Create your flavor structure:

```
flavors/
├── my-flavor/
│   ├── assets/
│   │   └── logo.png
│   ├── config/
│   │   ├── app.config.json
│   │   └── theme.json
│   └── styles/
│       └── brand.css
```

### 4. Switch to a flavor

```bash
flavor-switcher switch my-flavor
```

## Commands 📝

### `flavor-switcher init`
Initialize Brand Switcher in current directory.

### `flavor-switcher switch <brand>`
Switch to a specific flavor.

```bash
flavor-switcher switch my-flavor
```

### `flavor-switcher switch`
Interactive flavor selection (no arguments).

```bash
flavor-switcher switch
# Will show a list of available flavors to choose from
```

### `flavor-switcher reset`
Reset to original state and remove all flavor customizations.

```bash
flavor-switcher reset
```

### `flavor-switcher status`
Show current flavor status and modified files.

```bash
flavor-switcher status
```

### `flavor-switcher validate`
Validate configuration and all flavor structures.

```bash
flavor-switcher validate
```

## Configuration Structure 📋

### Main Configuration (`flavor-config.json`)

```json
{
  "version": "1.0.0",
  "projectRoot": "./",
  "flavors": {
    "flavor-name": {
      "displayName": "Display Name",
      "description": "Flavor description",
      "active": true
    }
  },
  "mappings": [
    {
      "source": "relative/path/in/flavor",
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
| `flavors` | object | Flavor definitions |
| `flavors.[name].displayName` | string | Human-readable flavor name |
| `flavors.[name].description` | string | Flavor description (optional) |
| `flavors.[name].active` | boolean | Whether flavor can be activated |
| `mappings` | array | File/directory mappings |
| `mappings[].source` | string | Path in flavor directory |
| `mappings[].target` | string | Path in project |
| `mappings[].type` | string | "file" or "directory" |
| `mappings[].required` | boolean | Whether this mapping is required |
| `mappings[].description` | string | Mapping description (optional) |
| `requiredStructure` | object | Required brand structure |
| `requiredStructure.files` | array | Required files in each flavor |
| `requiredStructure.directories` | array | Required directories in each flavor |

## Flavor Directory Structure 📁

Each flavor should follow this structure:

```
flavors/
├── flavor-name/
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
2. **Backup** - Creates backup of original files (stored in `.flavor-backup/`)
3. **File Hashing** - Stores SHA256 hashes of original files
4. **Apply Brand** - Copies brand files to project locations
5. **State Tracking** - Saves current state in `.flavor-state.json`
6. **Git Integration** - Updates `.gitignore` to exclude flavor files

## Git Integration 🔐

Flavor Switcher automatically manages your `.gitignore` file to prevent committing flavor-specific files:

- Adds `.flavor-state.json` to gitignore
- Adds `.flavor-backup/` directory to gitignore
- Adds all active flavor file paths to gitignore
- Maintains separation with marker comment

### Pre-commit Hook (Optional)

Add this Git hook to prevent committing with active flavor:

```bash
#!/bin/sh
# .git/hooks/pre-commit

if [ -f .flavor-state.json ]; then
  CURRENT_FLAVOR=$(grep '"currentFlavor"' .flavor-state.json | cut -d'"' -f4)
  if [ ! -z "$CURRENT_FLAVOR" ] && [ "$CURRENT_FLAVOR" != "null" ]; then
    echo "Error: Cannot commit with active flavor: $CURRENT_FLAVOR"
    echo "Run 'flavor-switcher reset' first"
    exit 1
  fi
fi
```

## Project Structure 📂

After refactoring, the project is organized into dedicated modules:

```
src/
├── types.ts           # TypeScript interfaces and type definitions
├── constants.ts       # Configuration constants and Joi schema
├── flavor-switcher.ts  # Core BrandSwitcher class with business logic
├── cli.ts            # CLI commands and command-line interface
└── index.ts          # Main entry point with exports
```

### File Responsibilities

- **`types.ts`** - Contains all TypeScript interfaces (FlavorConfig, Configuration, State, etc.)
- **`constants.ts`** - File paths, markers, and Joi validation schema
- **`flavor-switcher.ts`** - Core functionality for flavor switching operations
- **`cli.ts`** - Commander.js setup and CLI command definitions
- **`index.ts`** - Public API exports and CLI entry point

## Examples 📖

### React Application

```json
{
  "mappings": [
    {
      "source": "components/Logo.tsx",
      "target": "src/components/Logo.tsx",
      "type": "file",
      "required": true
    },
    {
      "source": "assets/",
      "target": "public/assets/brand/",
      "type": "directory",
      "required": false
    }
  ]
}
```

### Next.js Application

```json
{
  "mappings": [
    {
      "source": "public/",
      "target": "public/brand/",
      "type": "directory",
      "required": true
    },
    {
      "source": "config/theme.json",
      "target": "styles/theme.json",
      "type": "file",
      "required": true
    }
  ]
}
```

## Development 👨‍💻

### Setup

```bash
git clone <repository-url>
cd flavor-switcher
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

## License 📄

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing 🤝

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support 💬

- Open an issue on GitHub
- Check existing documentation
- Review example configurations