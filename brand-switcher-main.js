#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const chalk = require('chalk');
const { program } = require('commander');
const Joi = require('joi');
const inquirer = require('inquirer');
const glob = require('glob');

// Constants
const CONFIG_FILE = 'brand-config.json';
const STATE_FILE = '.brand-state.json';
const BRANDS_DIR = 'brands';
const GITIGNORE_MARKER = '# Brand Switcher - DO NOT EDIT BELOW THIS LINE';

// Configuration schema
const configSchema = Joi.object({
  version: Joi.string().required(),
  projectRoot: Joi.string().default('./'),
  brands: Joi.object().pattern(
    Joi.string(),
    Joi.object({
      displayName: Joi.string().required(),
      description: Joi.string(),
      active: Joi.boolean().default(true)
    })
  ).required(),
  mappings: Joi.array().items(
    Joi.object({
      source: Joi.string().required(),
      target: Joi.string().required(),
      type: Joi.string().valid('file', 'directory').default('file'),
      required: Joi.boolean().default(true),
      description: Joi.string()
    })
  ).required(),
  requiredStructure: Joi.object({
    files: Joi.array().items(Joi.string()).default([]),
    directories: Joi.array().items(Joi.string()).default([])
  }).default({})
}).required();

class BrandSwitcher {
  constructor() {
    this.config = null;
    this.state = null;
    this.currentBrand = null;
  }

  async init() {
    try {
      await this.loadConfig();
      await this.loadState();
    } catch (error) {
      console.error(chalk.red('Initialization failed:'), error.message);
      process.exit(1);
    }
  }

  async loadConfig() {
    const configPath = path.resolve(CONFIG_FILE);
    
    if (!await fs.pathExists(configPath)) {
      throw new Error(`Configuration file ${CONFIG_FILE} not found`);
    }

    try {
      const configData = await fs.readJson(configPath);
      const { error, value } = configSchema.validate(configData);
      
      if (error) {
        throw new Error(`Configuration validation failed: ${error.message}`);
      }
      
      this.config = value;
      console.log(chalk.green('✓'), 'Configuration loaded successfully');
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  async loadState() {
    const statePath = path.resolve(STATE_FILE);
    
    if (await fs.pathExists(statePath)) {
      try {
        this.state = await fs.readJson(statePath);
        this.currentBrand = this.state.currentBrand;
        console.log(chalk.green('✓'), `Current brand: ${chalk.cyan(this.currentBrand || 'none')}`);
      } catch (error) {
        console.warn(chalk.yellow('Warning:'), 'Could not load state file, creating new one');
        this.state = { currentBrand: null, originalFiles: {} };
      }
    } else {
      this.state = { currentBrand: null, originalFiles: {} };
    }
  }

  async saveState() {
    const statePath = path.resolve(STATE_FILE);
    await fs.writeJson(statePath, this.state, { spaces: 2 });
  }

  async validateBrandStructure(brandName) {
    const brandPath = path.join(BRANDS_DIR, brandName);
    const errors = [];
    
    if (!await fs.pathExists(brandPath)) {
      throw new Error(`Brand directory '${brandPath}' does not exist`);
    }

    // Check required files
    for (const file of this.config.requiredStructure.files) {
      const filePath = path.join(brandPath, file);
      if (!await fs.pathExists(filePath)) {
        errors.push(`Missing required file: ${file}`);
      }
    }

    // Check required directories
    for (const dir of this.config.requiredStructure.directories) {
      const dirPath = path.join(brandPath, dir);
      if (!await fs.pathExists(dirPath)) {
        errors.push(`Missing required directory: ${dir}`);
      }
    }

    // Validate mappings
    for (const mapping of this.config.mappings) {
      if (mapping.required) {
        const sourcePath = path.join(brandPath, mapping.source);
        if (!await fs.pathExists(sourcePath)) {
          errors.push(`Missing required mapping source: ${mapping.source}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Brand structure validation failed:\n${errors.join('\n')}`);
    }

    console.log(chalk.green('✓'), `Brand '${brandName}' structure validated`);
    return true;
  }

  getFileHash(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  async backupOriginalFiles(brandName) {
    const backups = {};
    
    for (const mapping of this.config.mappings) {
      const targetPath = path.join(this.config.projectRoot, mapping.target);
      
      if (await fs.pathExists(targetPath)) {
        const hash = this.getFileHash(targetPath);
        backups[mapping.target] = {
          hash: hash,
          exists: true,
          type: mapping.type
        };
        
        // Create backup
        const backupPath = path.join('.brand-backup', mapping.target);
        await fs.ensureDir(path.dirname(backupPath));
        await fs.copy(targetPath, backupPath);
      } else {
        backups[mapping.target] = {
          exists: false,
          type: mapping.type
        };
      }
    }
    
    this.state.originalFiles = backups;
    await this.saveState();
    console.log(chalk.green('✓'), 'Original files backed up');
  }

  async restoreOriginalFiles() {
    if (!this.state.originalFiles || Object.keys(this.state.originalFiles).length === 0) {
      console.log(chalk.yellow('No original files to restore'));
      return;
    }

    for (const [target, info] of Object.entries(this.state.originalFiles)) {
      const targetPath = path.join(this.config.projectRoot, target);
      const backupPath = path.join('.brand-backup', target);
      
      if (info.exists && await fs.pathExists(backupPath)) {
        await fs.copy(backupPath, targetPath, { overwrite: true });
        console.log(chalk.gray(`  Restored: ${target}`));
      } else if (!info.exists && await fs.pathExists(targetPath)) {
        // Remove files that didn't exist originally
        if (info.type === 'directory') {
          await fs.remove(targetPath);
        } else {
          await fs.unlink(targetPath);
        }
        console.log(chalk.gray(`  Removed: ${target}`));
      }
    }
    
    console.log(chalk.green('✓'), 'Original files restored');
  }

  async applyBrand(brandName) {
    const brandPath = path.join(BRANDS_DIR, brandName);
    
    for (const mapping of this.config.mappings) {
      const sourcePath = path.join(brandPath, mapping.source);
      const targetPath = path.join(this.config.projectRoot, mapping.target);
      
      if (await fs.pathExists(sourcePath)) {
        await fs.ensureDir(path.dirname(targetPath));
        await fs.copy(sourcePath, targetPath, { overwrite: true });
        console.log(chalk.gray(`  Applied: ${mapping.source} → ${mapping.target}`));
      } else if (mapping.required) {
        throw new Error(`Required source file missing: ${mapping.source}`);
      }
    }
    
    console.log(chalk.green('✓'), `Brand '${brandName}' applied successfully`);
  }

  async switchBrand(brandName) {
    try {
      // Validate brand exists in config
      if (!this.config.brands[brandName]) {
        throw new Error(`Brand '${brandName}' is not configured`);
      }

      if (!this.config.brands[brandName].active) {
        throw new Error(`Brand '${brandName}' is not active`);
      }

      // Validate brand structure
      await this.validateBrandStructure(brandName);

      // If there's a current brand, restore original files first
      if (this.currentBrand) {
        console.log(chalk.blue('→'), `Removing current brand: ${this.currentBrand}`);
        await this.restoreOriginalFiles();
      }

      // Backup original files if this is the first switch
      if (!this.currentBrand) {
        await this.backupOriginalFiles(brandName);
      }

      // Apply new brand
      console.log(chalk.blue('→'), `Applying brand: ${brandName}`);
      await this.applyBrand(brandName);

      // Update state
      this.state.currentBrand = brandName;
      this.currentBrand = brandName;
      await this.saveState();

      // Update gitignore
      await this.updateGitignore();

      console.log(chalk.green.bold('✓'), chalk.bold(`Successfully switched to brand: ${brandName}`));
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  async resetBrand() {
    try {
      if (!this.currentBrand) {
        console.log(chalk.yellow('No brand is currently active'));
        return;
      }

      console.log(chalk.blue('→'), 'Resetting to original state...');
      await this.restoreOriginalFiles();

      // Clear state
      this.state.currentBrand = null;
      this.currentBrand = null;
      this.state.originalFiles = {};
      await this.saveState();

      // Clean up backup directory
      if (await fs.pathExists('.brand-backup')) {
        await fs.remove('.brand-backup');
      }

      // Update gitignore
      await this.updateGitignore();

      console.log(chalk.green.bold('✓'), 'Successfully reset to original state');
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  async updateGitignore() {
    const gitignorePath = path.resolve('.gitignore');
    let content = '';
    
    if (await fs.pathExists(gitignorePath)) {
      content = await fs.readFile(gitignorePath, 'utf8');
    }

    // Remove old brand switcher section
    const markerIndex = content.indexOf(GITIGNORE_MARKER);
    if (markerIndex !== -1) {
      content = content.substring(0, markerIndex).trimEnd();
    }

    // Add brand switcher patterns
    const patterns = [
      '',
      GITIGNORE_MARKER,
      '.brand-state.json',
      '.brand-backup/'
    ];

    // Add current brand files to gitignore
    if (this.currentBrand) {
      for (const mapping of this.config.mappings) {
        const targetPath = mapping.target;
        patterns.push(targetPath);
      }
    }

    content = content + '\n' + patterns.join('\n');
    await fs.writeFile(gitignorePath, content);
    
    console.log(chalk.green('✓'), '.gitignore updated');
  }

  async checkStatus() {
    console.log(chalk.bold('\n📊 Brand Switcher Status\n'));
    
    console.log(chalk.cyan('Current brand:'), this.currentBrand || 'none');
    console.log(chalk.cyan('Config file:'), CONFIG_FILE);
    console.log(chalk.cyan('Brands directory:'), BRANDS_DIR);
    
    console.log(chalk.bold('\n📁 Available Brands:\n'));
    
    for (const [name, config] of Object.entries(this.config.brands)) {
      const status = config.active ? chalk.green('✓') : chalk.red('✗');
      const current = name === this.currentBrand ? chalk.yellow(' [CURRENT]') : '';
      console.log(`  ${status} ${name} - ${config.displayName}${current}`);
      if (config.description) {
        console.log(chalk.gray(`    ${config.description}`));
      }
    }

    if (this.currentBrand) {
      console.log(chalk.bold('\n🔄 Modified Files:\n'));
      for (const [target, info] of Object.entries(this.state.originalFiles)) {
        const currentPath = path.join(this.config.projectRoot, target);
        const currentHash = this.getFileHash(currentPath);
        const modified = currentHash !== info.hash ? chalk.yellow(' [MODIFIED]') : '';
        console.log(`  ${target}${modified}`);
      }
    }

    console.log('');
  }

  async interactiveSwitch() {
    const brands = Object.entries(this.config.brands)
      .filter(([_, config]) => config.active)
      .map(([name, config]) => ({
        name: `${config.displayName} (${name})${name === this.currentBrand ? ' [CURRENT]' : ''}`,
        value: name
      }));

    if (brands.length === 0) {
      console.log(chalk.yellow('No active brands available'));
      return;
    }

    const { selectedBrand } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedBrand',
        message: 'Select a brand to switch to:',
        choices: brands
      }
    ]);

    if (selectedBrand === this.currentBrand) {
      console.log(chalk.yellow('This brand is already active'));
      return;
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Switch to brand '${selectedBrand}'?`,
        default: true
      }
    ]);

    if (confirm) {
      await this.switchBrand(selectedBrand);
    }
  }

  async validate() {
    console.log(chalk.bold('\n🔍 Validating Configuration\n'));
    
    let hasErrors = false;

    // Check brands directory
    if (!await fs.pathExists(BRANDS_DIR)) {
      console.error(chalk.red('✗'), `Brands directory '${BRANDS_DIR}' not found`);
      hasErrors = true;
    } else {
      console.log(chalk.green('✓'), 'Brands directory exists');
    }

    // Validate each brand
    for (const [brandName, brandConfig] of Object.entries(this.config.brands)) {
      if (!brandConfig.active) continue;
      
      console.log(chalk.bold(`\nValidating brand: ${brandName}`));
      
      try {
        await this.validateBrandStructure(brandName);
      } catch (error) {
        console.error(chalk.red('✗'), error.message);
        hasErrors = true;
      }
    }

    // Check for uncommitted brand files
    if (this.currentBrand) {
      console.log(chalk.bold('\n🔍 Checking for uncommitted brand files\n'));
      
      for (const mapping of this.config.mappings) {
        const targetPath = path.join(this.config.projectRoot, mapping.target);
        
        if (await fs.pathExists(targetPath)) {
          const currentHash = this.getFileHash(targetPath);
          const originalHash = this.state.originalFiles[mapping.target]?.hash;
          
          if (currentHash !== originalHash) {
            console.warn(chalk.yellow('⚠'), `Modified: ${mapping.target}`);
          }
        }
      }
    }

    if (!hasErrors) {
      console.log(chalk.green.bold('\n✓ All validations passed'));
    } else {
      console.log(chalk.red.bold('\n✗ Validation failed'));
      process.exit(1);
    }
  }
}

// CLI Setup
program
  .name('brand-switcher')
  .description('CLI tool for managing white-label application resources')
  .version('1.0.0');

program
  .command('switch <brand>')
  .description('Switch to a specific brand')
  .action(async (brand) => {
    const switcher = new BrandSwitcher();
    await switcher.init();
    await switcher.switchBrand(brand);
  });

program
  .command('switch')
  .description('Interactively select and switch brand')
  .action(async () => {
    const switcher = new BrandSwitcher();
    await switcher.init();
    await switcher.interactiveSwitch();
  });

program
  .command('reset')
  .description('Reset to original state (remove all brand customizations)')
  .action(async () => {
    const switcher = new BrandSwitcher();
    await switcher.init();
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to reset to original state?',
        default: false
      }
    ]);
    
    if (confirm) {
      await switcher.resetBrand();
    }
  });

program
  .command('status')
  .description('Show current brand status')
  .action(async () => {
    const switcher = new BrandSwitcher();
    await switcher.init();
    await switcher.checkStatus();
  });

program
  .command('validate')
  .description('Validate configuration and brand structures')
  .action(async () => {
    const switcher = new BrandSwitcher();
    await switcher.init();
    await switcher.validate();
  });

program
  .command('init')
  .description('Initialize brand switcher in current directory')
  .action(async () => {
    console.log(chalk.bold('🚀 Initializing Brand Switcher\n'));
    
    // Check if already initialized
    if (await fs.pathExists(CONFIG_FILE)) {
      console.log(chalk.yellow('Brand Switcher is already initialized'));
      return;
    }

    // Create default configuration
    const defaultConfig = {
      version: "1.0.0",
      projectRoot: "./",
      brands: {
        "example-brand": {
          displayName: "Example Brand",
          description: "Example brand configuration",
          active: true
        }
      },
      mappings: [
        {
          source: "assets/logo.png",
          target: "src/assets/logo.png",
          type: "file",
          required: true,
          description: "Brand logo"
        },
        {
          source: "config/app.config.json",
          target: "src/config/app.config.json",
          type: "file",
          required: true,
          description: "Application configuration"
        },
        {
          source: "styles/",
          target: "src/styles/brand/",
          type: "directory",
          required: false,
          description: "Brand-specific styles"
        }
      ],
      requiredStructure: {
        files: ["assets/logo.png", "config/app.config.json"],
        directories: ["assets", "config"]
      }
    };

    await fs.writeJson(CONFIG_FILE, defaultConfig, { spaces: 2 });
    console.log(chalk.green('✓'), `Created ${CONFIG_FILE}`);

    // Create brands directory
    await fs.ensureDir(BRANDS_DIR);
    console.log(chalk.green('✓'), `Created ${BRANDS_DIR} directory`);

    // Create example brand structure
    const exampleBrandPath = path.join(BRANDS_DIR, 'example-brand');
    await fs.ensureDir(path.join(exampleBrandPath, 'assets'));
    await fs.ensureDir(path.join(exampleBrandPath, 'config'));
    await fs.ensureDir(path.join(exampleBrandPath, 'styles'));
    
    // Create example files
    await fs.writeFile(
      path.join(exampleBrandPath, 'assets', 'logo.png'),
      '# Placeholder for logo'
    );
    
    await fs.writeJson(
      path.join(exampleBrandPath, 'config', 'app.config.json'),
      {
        brandName: "Example Brand",
        primaryColor: "#007bff",
        apiUrl: "https://api.example.com"
      },
      { spaces: 2 }
    );
    
    console.log(chalk.green('✓'), 'Created example brand structure');
    
    // Update .gitignore
    const gitignorePath = '.gitignore';
    let gitignoreContent = '';
    
    if (await fs.pathExists(gitignorePath)) {
      gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
    }
    
    if (!gitignoreContent.includes(GITIGNORE_MARKER)) {
      gitignoreContent += `\n${GITIGNORE_MARKER}\n.brand-state.json\n.brand-backup/\n`;
      await fs.writeFile(gitignorePath, gitignoreContent);
      console.log(chalk.green('✓'), 'Updated .gitignore');
    }
    
    console.log(chalk.green.bold('\n✓ Brand Switcher initialized successfully!'));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('1. Edit brand-config.json to match your project structure'));
    console.log(chalk.gray('2. Add your brand assets to the brands/ directory'));
    console.log(chalk.gray('3. Run "brand-switcher switch <brand-name>" to apply a brand'));
  });

program.parse(process.argv);