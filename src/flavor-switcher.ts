import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { Configuration, State, FileInfo } from './types';
import { 
  CONFIG_FILE, 
  STATE_FILE, 
  FLAVORS_DIR, 
  BACKUP_DIR, 
  GITIGNORE_MARKER, 
  configSchema 
} from './constants';

export class FlavorSwitcher {
  private config: Configuration | null = null;
  private state: State | null = null;
  private currentFlavor: string | null = null;

  constructor() {}

  async init(): Promise<void> {
    try {
      await this.loadConfig();
      await this.loadState();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red('Initialization failed:'), errorMessage);
      process.exit(1);
    }
  }

  async loadConfig(): Promise<void> {
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
      
      this.config = value as Configuration;
      console.log(chalk.green('✓'), 'Configuration loaded successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to load configuration: ${errorMessage}`);
    }
  }

  async loadState(): Promise<void> {
    const statePath = path.resolve(STATE_FILE);
    
    if (await fs.pathExists(statePath)) {
      try {
        this.state = await fs.readJson(statePath) as State;
        this.currentFlavor = this.state.currentFlavor;
        console.log(chalk.green('✓'), `Current flavor: ${this.currentFlavor || 'none'}`);
      } catch (error) {
        console.warn(chalk.yellow('Warning:'), 'Could not load state file, creating new one');
        this.state = { currentFlavor: null, originalFiles: {} };
      }
    } else {
      this.state = { currentFlavor: null, originalFiles: {} };
    }
  }

  async saveState(): Promise<void> {
    if (!this.state) return;
    const statePath = path.resolve(STATE_FILE);
    await fs.writeJson(statePath, this.state, { spaces: 2 });
  }

  async validateFlavorStructure(flavorName: string): Promise<boolean> {
    if (!this.config) throw new Error('Configuration not loaded');
    
    const flavorPath = path.join(FLAVORS_DIR, flavorName);
    const errors: string[] = [];
    
    if (!await fs.pathExists(flavorPath)) {
      throw new Error(`Flavor directory '${flavorPath}' does not exist`);
    }

    for (const file of this.config.requiredStructure.files) {
      const filePath = path.join(flavorPath, file);
      if (!await fs.pathExists(filePath)) {
        errors.push(`Missing required file: ${file}`);
      }
    }

    for (const dir of this.config.requiredStructure.directories) {
      const dirPath = path.join(flavorPath, dir);
      if (!await fs.pathExists(dirPath)) {
        errors.push(`Missing required directory: ${dir}`);
      }
    }

    for (const mapping of this.config.mappings) {
      if (mapping.required) {
        const sourcePath = path.join(flavorPath, mapping.source);
        if (!await fs.pathExists(sourcePath)) {
          errors.push(`Missing required mapping source: ${mapping.source}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Flavor structure validation failed:\n${errors.join('\n')}`);
    }

    console.log(chalk.green('✓'), `Flavor '${flavorName}' structure validated`);
    return true;
  }

  getFileHash(filePath: string): string | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return null;
    }
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  async backupOriginalFiles(flavorName: string): Promise<void> {
    if (!this.config || !this.state) throw new Error('Not initialized');
    
    const backups: Record<string, FileInfo> = {};
    
    for (const mapping of this.config.mappings) {
      const targetPath = path.join(this.config.projectRoot, mapping.target);
      
      if (await fs.pathExists(targetPath)) {
        const hash = this.getFileHash(targetPath);
        backups[mapping.target] = {
          hash: hash || undefined,
          exists: true,
          type: mapping.type
        };
        
        const backupPath = path.join(BACKUP_DIR, mapping.target);
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

  async restoreOriginalFiles(): Promise<void> {
    if (!this.state || !this.config) throw new Error('Not initialized');
    
    if (!this.state.originalFiles || Object.keys(this.state.originalFiles).length === 0) {
      console.log(chalk.yellow('No original files to restore'));
      return;
    }

    for (const [target, info] of Object.entries(this.state.originalFiles)) {
      const targetPath = path.join(this.config.projectRoot, target);
      const backupPath = path.join(BACKUP_DIR, target);
      
      if (info.exists && await fs.pathExists(backupPath)) {
        await fs.copy(backupPath, targetPath, { overwrite: true });
        console.log(chalk.gray(`  Restored: ${target}`));
      } else if (!info.exists && await fs.pathExists(targetPath)) {
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

  async applyFlavor(flavorName: string): Promise<void> {
    if (!this.config) throw new Error('Configuration not loaded');
    
    const flavorPath = path.join(FLAVORS_DIR, flavorName);
    
    for (const mapping of this.config.mappings) {
      const sourcePath = path.join(flavorPath, mapping.source);
      const targetPath = path.join(this.config.projectRoot, mapping.target);
      
      if (await fs.pathExists(sourcePath)) {
        await fs.ensureDir(path.dirname(targetPath));
        await fs.copy(sourcePath, targetPath, { overwrite: true });
        console.log(chalk.gray(`  Applied: ${mapping.source} → ${mapping.target}`));
      } else if (mapping.required) {
        throw new Error(`Required source file missing: ${mapping.source}`);
      }
    }
    
    console.log(chalk.green('✓'), `Flavor '${flavorName}' applied successfully`);
  }

  async switchFlavor(flavorName: string): Promise<void> {
    if (!this.config || !this.state) throw new Error('Not initialized');
    
    try {
      if (!this.config.flavors[flavorName]) {
        throw new Error(`Flavor '${flavorName}' is not configured`);
      }

      if (!this.config.flavors[flavorName].active) {
        throw new Error(`Flavor '${flavorName}' is not active`);
      }

      await this.validateFlavorStructure(flavorName);

      if (this.currentFlavor) {
        console.log(chalk.blue('→'), `Removing current flavor: ${this.currentFlavor}`);
        await this.restoreOriginalFiles();
      }

      if (!this.currentFlavor) {
        await this.backupOriginalFiles(flavorName);
      }

      console.log(chalk.blue('→'), `Applying flavor: ${flavorName}`);
      await this.applyFlavor(flavorName);

      this.state.currentFlavor = flavorName;
      this.currentFlavor = flavorName;
      await this.saveState();

      await this.updateGitignore();

      console.log(chalk.green('✓'), chalk.bold(`Successfully switched to flavor: ${flavorName}`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red('Error:'), errorMessage);
      process.exit(1);
    }
  }

  async resetFlavor(): Promise<void> {
    if (!this.state) throw new Error('Not initialized');
    
    try {
      if (!this.currentFlavor) {
        console.log(chalk.yellow('No flavor is currently active'));
        return;
      }

      console.log(chalk.blue('→'), 'Resetting to original state...');
      await this.restoreOriginalFiles();

      this.state.currentFlavor = null;
      this.currentFlavor = null;
      this.state.originalFiles = {};
      await this.saveState();

      if (await fs.pathExists(BACKUP_DIR)) {
        await fs.remove(BACKUP_DIR);
      }

      await this.updateGitignore();

      console.log(chalk.green('✓'), 'Successfully reset to original state');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red('Error:'), errorMessage);
      process.exit(1);
    }
  }

  async updateGitignore(): Promise<void> {
    if (!this.config) throw new Error('Configuration not loaded');
    
    const gitignorePath = path.resolve('.gitignore');
    let content = '';
    
    if (await fs.pathExists(gitignorePath)) {
      content = await fs.readFile(gitignorePath, 'utf8');
    }

    const markerIndex = content.indexOf(GITIGNORE_MARKER);
    if (markerIndex !== -1) {
      content = content.substring(0, markerIndex).trimEnd();
    }

    const patterns: string[] = [
      '',
      GITIGNORE_MARKER,
      STATE_FILE,
      `${BACKUP_DIR}/`
    ];

    if (this.currentFlavor) {
      for (const mapping of this.config.mappings) {
        patterns.push(mapping.target);
      }
    }

    content = content + '\n' + patterns.join('\n');
    await fs.writeFile(gitignorePath, content);
    
    console.log(chalk.green('✓'), '.gitignore updated');
  }

  async checkStatus(): Promise<void> {
    if (!this.config || !this.state) throw new Error('Not initialized');
    
    console.log(chalk.bold('\n📊 Flavor Switcher Status\n'));
    
    console.log(chalk.cyan('Current flavor:'), this.currentFlavor || 'none');
    console.log(chalk.cyan('Config file:'), CONFIG_FILE);
    console.log(chalk.cyan('Flavors directory:'), FLAVORS_DIR);
    
    console.log(chalk.bold('\n📁 Available Flavors:\n'));
    
    for (const [name, config] of Object.entries(this.config.flavors)) {
      const status = config.active ? chalk.green('✓') : chalk.red('✗');
      const current = name === this.currentFlavor ? chalk.yellow(' [CURRENT]') : '';
      console.log(`  ${status} ${name} - ${config.displayName}${current}`);
      if (config.description) {
        console.log(chalk.gray(`    ${config.description}`));
      }
    }

    if (this.currentFlavor && this.state.originalFiles) {
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

  async interactiveSwitch(): Promise<void> {
    if (!this.config) throw new Error('Configuration not loaded');
    
    const flavors = Object.entries(this.config.flavors)
      .filter(([_, config]) => config.active)
      .map(([name, config]) => ({
        name: `${config.displayName} (${name})${name === this.currentFlavor ? ' [CURRENT]' : ''}`,
        value: name
      }));

    if (flavors.length === 0) {
      console.log(chalk.yellow('No active flavors available'));
      return;
    }

    const { selectedFlavor } = await inquirer.prompt<{ selectedFlavor: string }>([
      {
        type: 'list',
        name: 'selectedFlavor',
        message: 'Select a flavor to switch to:',
        choices: flavors
      }
    ]);

    if (selectedFlavor === this.currentFlavor) {
      console.log(chalk.yellow('This flavor is already active'));
      return;
    }

    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Switch to flavor '${selectedFlavor}'?`,
        default: true
      }
    ]);

    if (confirm) {
      await this.switchFlavor(selectedFlavor);
    }
  }

  async validate(): Promise<void> {
    if (!this.config || !this.state) throw new Error('Not initialized');
    
    console.log(chalk.bold('\n🔍 Validating Configuration\n'));
    
    let hasErrors = false;

    if (!await fs.pathExists(FLAVORS_DIR)) {
      console.error(chalk.red('✗'), `Flavors directory '${FLAVORS_DIR}' not found`);
      hasErrors = true;
    } else {
      console.log(chalk.green('✓'), 'Flavors directory exists');
    }

    for (const [flavorName, flavorConfig] of Object.entries(this.config.flavors)) {
      if (!flavorConfig.active) continue;
      
      console.log(chalk.bold(`\nValidating flavor: ${flavorName}`));
      
      try {
        await this.validateFlavorStructure(flavorName);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(chalk.red('✗'), errorMessage);
        hasErrors = true;
      }
    }

    if (this.currentFlavor && this.state.originalFiles) {
      console.log(chalk.bold('\n🔍 Checking for uncommitted flavor files\n'));
      
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
      console.log(chalk.green('\n✓ All validations passed'));
    } else {
      console.log(chalk.red('\n✗ Validation failed'));
      process.exit(1);
    }
  }

  static async initProject(): Promise<void> {
    console.log(chalk.bold('🚀 Initializing Flavor Switcher\n'));
    
    if (await fs.pathExists(CONFIG_FILE)) {
      console.log(chalk.yellow('Flavor Switcher is already initialized'));
      return;
    }

    const defaultConfig = {
      version: "1.0.0",
      projectRoot: "./",
      flavors: {
        "example-flavor": {
          displayName: "Example Flavor",
          description: "Example flavor configuration",
          active: true
        }
      },
      mappings: [
        {
          source: "assets/logo.png",
          target: "src/assets/logo.png",
          type: "file",
          required: true,
          description: "Flavor logo"
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
          target: "src/styles/flavor/",
          type: "directory",
          required: false,
          description: "Flavor-specific styles"
        }
      ],
      requiredStructure: {
        files: ["assets/logo.png", "config/app.config.json"],
        directories: ["assets", "config"]
      }
    };

    await fs.writeJson(CONFIG_FILE, defaultConfig, { spaces: 2 });
    console.log(chalk.green('✓'), `Created ${CONFIG_FILE}`);

    await fs.ensureDir(FLAVORS_DIR);
    console.log(chalk.green('✓'), `Created ${FLAVORS_DIR} directory`);

    const exampleFlavorPath = path.join(FLAVORS_DIR, 'example-flavor');
    await fs.ensureDir(path.join(exampleFlavorPath, 'assets'));
    await fs.ensureDir(path.join(exampleFlavorPath, 'config'));
    await fs.ensureDir(path.join(exampleFlavorPath, 'styles'));
    
    await fs.writeFile(
      path.join(exampleFlavorPath, 'assets', 'logo.png'),
      '# Placeholder for logo'
    );
    
    await fs.writeJson(
      path.join(exampleFlavorPath, 'config', 'app.config.json'),
      {
        flavorName: "Example Flavor",
        primaryColor: "#007bff",
        apiUrl: "https://api.example.com"
      },
      { spaces: 2 }
    );
    
    console.log(chalk.green('✓'), 'Created example flavor structure');
    
    const gitignorePath = '.gitignore';
    let gitignoreContent = '';
    
    if (await fs.pathExists(gitignorePath)) {
      gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
    }
    
    if (!gitignoreContent.includes(GITIGNORE_MARKER)) {
      gitignoreContent += `\n${GITIGNORE_MARKER}\n${STATE_FILE}\n${BACKUP_DIR}/\n`;
      await fs.writeFile(gitignorePath, gitignoreContent);
      console.log(chalk.green('✓'), 'Updated .gitignore');
    }
    
    console.log(chalk.green('\n✓ Flavor Switcher initialized successfully!'));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('1. Edit flavor-config.json to match your project structure'));
    console.log(chalk.gray('2. Add your flavor assets to the flavors/ directory'));
    console.log(chalk.gray('3. Run "flavor-switcher switch <flavor-name>" to apply a flavor'));
  }
}

export default FlavorSwitcher;