// __tests__/brandSwitcher.test.ts

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { BrandSwitcher } from '../src/index';
import inquirer from 'inquirer';
import chalk from 'chalk';

// Mock modules
jest.mock('inquirer');
jest.mock('chalk', () => ({
  green: jest.fn((text: string) => text),
  red: jest.fn((text: string) => text),
  yellow: jest.fn((text: string) => text),
  blue: jest.fn((text: string) => text),
  cyan: jest.fn((text: string) => text),
  gray: jest.fn((text: string) => text),
  bold: jest.fn((text: string) => text),
  default: {
    green: jest.fn((text: string) => text),
    red: jest.fn((text: string) => text),
    yellow: jest.fn((text: string) => text),
    blue: jest.fn((text: string) => text),
    cyan: jest.fn((text: string) => text),
    gray: jest.fn((text: string) => text),
    bold: jest.fn((text: string) => text),
  }
}));

// Test configuration
const TEST_DIR = path.join(__dirname, 'test-workspace');
const CONFIG_FILE = 'brand-config.json';
const STATE_FILE = '.brand-state.json';
const BRANDS_DIR = 'brands';
const BACKUP_DIR = '.brand-backup';

describe('BrandSwitcher', () => {
  let originalCwd: string;
  let switcher: BrandSwitcher;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeAll(() => {
    originalCwd = process.cwd();
  });

  beforeEach(async () => {
    // Create test directory
    await fs.ensureDir(TEST_DIR);
    process.chdir(TEST_DIR);

    // Create spy functions
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process exit with code ${code}`);
    });

    switcher = new BrandSwitcher();
  });

  afterEach(async () => {
    // Restore spies
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    processExitSpy.mockRestore();

    // Clean up test directory
    process.chdir(originalCwd);
    await fs.remove(TEST_DIR);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize project successfully', async () => {
      await BrandSwitcher.initProject();

      // Check if configuration file was created
      expect(await fs.pathExists(CONFIG_FILE)).toBe(true);
      
      // Check if brands directory was created
      expect(await fs.pathExists(BRANDS_DIR)).toBe(true);
      
      // Check if example brand was created
      expect(await fs.pathExists(path.join(BRANDS_DIR, 'example-brand'))).toBe(true);
      
      // Check configuration content
      const config = await fs.readJson(CONFIG_FILE);
      expect(config.version).toBe('1.0.0');
      expect(config.brands['example-brand']).toBeDefined();
      expect(config.mappings).toHaveLength(3);
    });

    it('should not reinitialize if already initialized', async () => {
      await BrandSwitcher.initProject();
      await BrandSwitcher.initProject(); // Try to initialize again

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('already initialized')
      );
    });

    it('should fail to load config if file does not exist', async () => {
      await expect(switcher.init()).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initialization failed'),
        expect.any(String)
      );
    });

    it('should create gitignore entries', async () => {
      await BrandSwitcher.initProject();
      
      const gitignoreContent = await fs.readFile('.gitignore', 'utf8');
      expect(gitignoreContent).toContain('# Brand Switcher');
      expect(gitignoreContent).toContain('.brand-state.json');
      expect(gitignoreContent).toContain('.brand-backup/');
    });
  });

  describe('Configuration Management', () => {
    beforeEach(async () => {
      await setupTestEnvironment();
    });

    it('should load valid configuration', async () => {
      await switcher.init();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓'),
        expect.stringContaining('Configuration loaded successfully')
      );
    });

    it('should validate configuration schema', async () => {
      const invalidConfig = {
        version: '1.0.0',
        // Missing required fields
      };
      
      await fs.writeJson(CONFIG_FILE, invalidConfig);
      
      await expect(switcher.init()).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initialization failed'),
        expect.any(String)
      );
    });

    it('should handle corrupted configuration file', async () => {
      await fs.writeFile(CONFIG_FILE, 'invalid json content');
      
      await expect(switcher.init()).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should set default values for optional fields', async () => {
      const minimalConfig = {
        version: '1.0.0',
        brands: {
          'test-brand': {
            displayName: 'Test Brand'
          }
        },
        mappings: []
      };
      
      await fs.writeJson(CONFIG_FILE, minimalConfig);
      await switcher.init();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓'),
        expect.stringContaining('Configuration loaded')
      );
    });
  });

  describe('State Management', () => {
    beforeEach(async () => {
      await setupTestEnvironment();
    });

    it('should create new state if not exists', async () => {
      await switcher.init();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓'),
        expect.stringContaining('Current brand: none')
      );
    });

    it('should load existing state', async () => {
      const existingState = {
        currentBrand: 'test-brand',
        originalFiles: {}
      };
      
      await fs.writeJson(STATE_FILE, existingState);
      await switcher.init();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓'),
        expect.stringContaining('Current brand: test-brand')
      );
    });

    it('should handle corrupted state file', async () => {
      await fs.writeFile(STATE_FILE, 'invalid json');
      await switcher.init();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning'),
        expect.stringContaining('Could not load state file')
      );
    });

    it('should save state correctly', async () => {
      await switcher.init();
      await switcher.switchBrand('brand-a');
      
      const savedState = await fs.readJson(STATE_FILE);
      expect(savedState.currentBrand).toBe('brand-a');
      expect(savedState.originalFiles).toBeDefined();
    });
  });

  describe('Brand Structure Validation', () => {
    beforeEach(async () => {
      await setupTestEnvironment();
      await switcher.init();
    });

    it('should validate complete brand structure', async () => {
      const result = await switcher.validateBrandStructure('brand-a');
      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓'),
        expect.stringContaining('structure validated')
      );
    });

    it('should fail if brand directory does not exist', async () => {
      await expect(
        switcher.validateBrandStructure('non-existent-brand')
      ).rejects.toThrow('Brand directory');
    });

    it('should fail if required files are missing', async () => {
      await fs.remove(path.join(BRANDS_DIR, 'brand-a', 'assets', 'logo.png'));
      
      await expect(
        switcher.validateBrandStructure('brand-a')
      ).rejects.toThrow('Missing required file');
    });

    it('should fail if required directories are missing', async () => {
      await fs.remove(path.join(BRANDS_DIR, 'brand-a', 'config'));
      
      await expect(
        switcher.validateBrandStructure('brand-a')
      ).rejects.toThrow('Missing required directory');
    });

    it('should validate optional mappings correctly', async () => {
      // Remove optional directory
      await fs.remove(path.join(BRANDS_DIR, 'brand-a', 'styles'));
      
      // Should still validate successfully
      const result = await switcher.validateBrandStructure('brand-a');
      expect(result).toBe(true);
    });
  });

  describe('Brand Switching', () => {
    beforeEach(async () => {
      await setupTestEnvironment();
      await createProjectFiles();
      await switcher.init();
    });

    it('should switch to a brand successfully', async () => {
      await switcher.switchBrand('brand-a');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓'),
        expect.stringContaining('Successfully switched to brand: brand-a')
      );
      
      // Check if files were copied
      expect(await fs.pathExists('src/assets/logo.png')).toBe(true);
      expect(await fs.pathExists('src/config/app.config.json')).toBe(true);
    });

    it('should backup original files before switching', async () => {
      await switcher.switchBrand('brand-a');
      
      expect(await fs.pathExists(path.join(BACKUP_DIR, 'src/assets/logo.png'))).toBe(true);
      expect(await fs.pathExists(path.join(BACKUP_DIR, 'src/config/app.config.json'))).toBe(true);
    });

    it('should fail to switch to non-existent brand', async () => {
      await expect(switcher.switchBrand('non-existent')).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error'),
        expect.stringContaining('is not configured')
      );
    });

    it('should fail to switch to inactive brand', async () => {
      await expect(switcher.switchBrand('brand-c')).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error'),
        expect.stringContaining('is not active')
      );
    });

    it('should switch between brands correctly', async () => {
      await switcher.switchBrand('brand-a');
      await switcher.switchBrand('brand-b');
      
      const state = await fs.readJson(STATE_FILE);
      expect(state.currentBrand).toBe('brand-b');
      
      // Check that brand-b files are applied
      const config = await fs.readJson('src/config/app.config.json');
      expect(config.brandName).toBe('Brand B');
    });

    it('should handle missing optional files gracefully', async () => {
      // Remove optional styles directory from brand-a
      await fs.remove(path.join(BRANDS_DIR, 'brand-a', 'styles'));
      
      await switcher.switchBrand('brand-a');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓'),
        expect.stringContaining('Successfully switched')
      );
    });
  });

  describe('Brand Reset', () => {
    beforeEach(async () => {
      await setupTestEnvironment();
      await createProjectFiles();
      await switcher.init();
    });

    it('should reset to original state', async () => {
      await switcher.switchBrand('brand-a');
      await switcher.resetBrand();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓'),
        expect.stringContaining('Successfully reset to original state')
      );
      
      const state = await fs.readJson(STATE_FILE);
      expect(state.currentBrand).toBeNull();
      expect(Object.keys(state.originalFiles)).toHaveLength(0);
    });

    it('should restore original files correctly', async () => {
      const originalContent = 'original content';
      await fs.writeFile('src/assets/logo.png', originalContent);
      
      await switcher.switchBrand('brand-a');
      
      // Verify brand file is applied
      const brandContent = await fs.readFile('src/assets/logo.png', 'utf8');
      expect(brandContent).not.toBe(originalContent);
      
      await switcher.resetBrand();
      
      // Verify original file is restored
      const restoredContent = await fs.readFile('src/assets/logo.png', 'utf8');
      expect(restoredContent).toBe(originalContent);
    });

    it('should remove files that did not exist originally', async () => {
      // Don't create original file
      await fs.remove('src/styles/brand');
      
      await switcher.switchBrand('brand-a');
      expect(await fs.pathExists('src/styles/brand')).toBe(true);
      
      await switcher.resetBrand();
      expect(await fs.pathExists('src/styles/brand')).toBe(false);
    });

    it('should handle reset when no brand is active', async () => {
      await switcher.resetBrand();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No brand is currently active')
      );
    });

    it('should clean up backup directory after reset', async () => {
      await switcher.switchBrand('brand-a');
      expect(await fs.pathExists(BACKUP_DIR)).toBe(true);
      
      await switcher.resetBrand();
      expect(await fs.pathExists(BACKUP_DIR)).toBe(false);
    });
  });

  describe('File Hashing', () => {
    beforeEach(async () => {
      await setupTestEnvironment();
      await createProjectFiles();
      await switcher.init();
    });

    it('should calculate file hash correctly', () => {
      const testFile = 'test-hash-file.txt';
      fs.writeFileSync(testFile, 'test content');
      
      const hash = switcher.getFileHash(testFile);
      
      // Calculate expected hash
      const expectedHash = crypto
        .createHash('sha256')
        .update('test content')
        .digest('hex');
      
      expect(hash).toBe(expectedHash);
      
      fs.unlinkSync(testFile);
    });

    it('should return null for non-existent file', () => {
      const hash = switcher.getFileHash('non-existent-file.txt');
      expect(hash).toBeNull();
    });

    it('should detect file modifications', async () => {
      await fs.writeFile('src/assets/logo.png', 'original');
      await switcher.switchBrand('brand-a');
      
      // Modify the file after brand is applied
      await fs.writeFile('src/assets/logo.png', 'modified content');
      
      await switcher.validate();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠'),
        expect.stringContaining('Modified: src/assets/logo.png')
      );
    });
  });

  describe('Git Integration', () => {
    beforeEach(async () => {
      await setupTestEnvironment();
      await createProjectFiles();
      await switcher.init();
    });

    it('should update gitignore when switching brand', async () => {
      await switcher.switchBrand('brand-a');
      
      const gitignoreContent = await fs.readFile('.gitignore', 'utf8');
      expect(gitignoreContent).toContain('src/assets/logo.png');
      expect(gitignoreContent).toContain('src/config/app.config.json');
    });

    it('should clean gitignore when resetting', async () => {
      await switcher.switchBrand('brand-a');
      await switcher.resetBrand();
      
      const gitignoreContent = await fs.readFile('.gitignore', 'utf8');
      expect(gitignoreContent).not.toContain('src/assets/logo.png');
      expect(gitignoreContent).not.toContain('src/config/app.config.json');
    });

    it('should preserve existing gitignore content', async () => {
      const existingContent = '# Existing content\nnode_modules/\n';
      await fs.writeFile('.gitignore', existingContent);
      
      await switcher.switchBrand('brand-a');
      
      const gitignoreContent = await fs.readFile('.gitignore', 'utf8');
      expect(gitignoreContent).toContain('# Existing content');
      expect(gitignoreContent).toContain('node_modules/');
    });

    it('should handle multiple gitignore updates correctly', async () => {
      await switcher.switchBrand('brand-a');
      await switcher.switchBrand('brand-b');
      
      const gitignoreContent = await fs.readFile('.gitignore', 'utf8');
      const markerCount = (gitignoreContent.match(/# Brand Switcher/g) || []).length;
      expect(markerCount).toBe(1);
    });
  });

  describe('Status Command', () => {
    beforeEach(async () => {
      await setupTestEnvironment();
      await createProjectFiles();
      await switcher.init();
    });

    it('should display current status correctly', async () => {
      await switcher.checkStatus();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Current brand:'),
        'none'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Available Brands')
      );
    });

    it('should show active brand correctly', async () => {
      await switcher.switchBrand('brand-a');
      await switcher.checkStatus();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Current brand:'),
        'brand-a'
      );
    });

    it('should display modified files', async () => {
      await switcher.switchBrand('brand-a');
      
      // Modify a file
      await fs.writeFile('src/assets/logo.png', 'modified content');
      
      await switcher.checkStatus();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('src/assets/logo.png'),
        expect.stringContaining('[MODIFIED]')
      );
    });
  });

  describe('Interactive Mode', () => {
    beforeEach(async () => {
      await setupTestEnvironment();
      await createProjectFiles();
      await switcher.init();
    });

    it('should prompt for brand selection', async () => {
      const inquirerMock = inquirer as jest.Mocked<typeof inquirer>;
      inquirerMock.prompt.mockResolvedValueOnce({ selectedBrand: 'brand-a' })
                          .mockResolvedValueOnce({ confirm: true });
      
      await switcher.interactiveSwitch();
      
      expect(inquirerMock.prompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'list',
            name: 'selectedBrand',
            message: expect.stringContaining('Select a brand')
          })
        ])
      );
    });

    it('should handle brand selection cancellation', async () => {
      const inquirerMock = inquirer as jest.Mocked<typeof inquirer>;
      inquirerMock.prompt.mockResolvedValueOnce({ selectedBrand: 'brand-a' })
                          .mockResolvedValueOnce({ confirm: false });
      
      await switcher.interactiveSwitch();
      
      // Brand should not be switched
      const state = await fs.readJson(STATE_FILE);
      expect(state.currentBrand).toBeNull();
    });

    it('should prevent switching to current brand', async () => {
      await switcher.switchBrand('brand-a');
      
      const inquirerMock = inquirer as jest.Mocked<typeof inquirer>;
      inquirerMock.prompt.mockResolvedValueOnce({ selectedBrand: 'brand-a' });
      
      await switcher.interactiveSwitch();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('This brand is already active')
      );
    });

    it('should handle no active brands', async () => {
      // Set all brands to inactive
      const config = await fs.readJson(CONFIG_FILE);
      Object.keys(config.brands).forEach(brand => {
        config.brands[brand].active = false;
      });
      await fs.writeJson(CONFIG_FILE, config);
      
      await switcher.init();
      await switcher.interactiveSwitch();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No active brands available')
      );
    });
  });

  describe('Validation Command', () => {
    beforeEach(async () => {
      await setupTestEnvironment();
      await switcher.init();
    });

    it('should validate all brands successfully', async () => {
      await switcher.validate();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓ All validations passed')
      );
    });

    it('should report validation errors', async () => {
      // Remove required file
      await fs.remove(path.join(BRANDS_DIR, 'brand-a', 'assets', 'logo.png'));
      
      await expect(switcher.validate()).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('✗'),
        expect.stringContaining('Missing required file')
      );
    });

    it('should skip inactive brands during validation', async () => {
      // Remove files from inactive brand (brand-c)
      await fs.remove(path.join(BRANDS_DIR, 'brand-c'));
      
      await switcher.validate();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓ All validations passed')
      );
    });

    it('should check for missing brands directory', async () => {
      await fs.remove(BRANDS_DIR);
      
      await expect(switcher.validate()).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('✗'),
        expect.stringContaining('Brands directory')
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await setupTestEnvironment();
    });

    it('should handle file system errors gracefully', async () => {
      // Make config file read-only
      await fs.chmod(CONFIG_FILE, 0o444);
      
      await switcher.init();
      
      // Try to save state (should handle permission error)
      const state = { currentBrand: 'test', originalFiles: {} };
      await fs.writeJson(STATE_FILE, state);
      
      // Restore permissions
      await fs.chmod(CONFIG_FILE, 0o644);
    });

    it('should handle missing required mapping source', async () => {
      await switcher.init();
      
      // Remove required source file
      await fs.remove(path.join(BRANDS_DIR, 'brand-a', 'config', 'app.config.json'));
      
      await expect(switcher.switchBrand('brand-a')).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error'),
        expect.stringContaining('Required source file missing')
      );
    });

    it('should exit process on initialization failure', async () => {
      // Don't create config file
      
      try {
        await switcher.init();
      } catch (error) {
        // Expected to throw due to process.exit mock
      }
      
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});

// Helper functions
async function setupTestEnvironment(): Promise<void> {
  const config = {
    version: '1.0.0',
    projectRoot: './',
    brands: {
      'brand-a': {
        displayName: 'Brand A',
        description: 'Test brand A',
        active: true
      },
      'brand-b': {
        displayName: 'Brand B',
        description: 'Test brand B',
        active: true
      },
      'brand-c': {
        displayName: 'Brand C',
        description: 'Inactive brand',
        active: false
      }
    },
    mappings: [
      {
        source: 'assets/logo.png',
        target: 'src/assets/logo.png',
        type: 'file',
        required: true,
        description: 'Brand logo'
      },
      {
        source: 'config/app.config.json',
        target: 'src/config/app.config.json',
        type: 'file',
        required: true,
        description: 'App configuration'
      },
      {
        source: 'styles/',
        target: 'src/styles/brand/',
        type: 'directory',
        required: false,
        description: 'Brand styles'
      }
    ],
    requiredStructure: {
      files: ['assets/logo.png', 'config/app.config.json'],
      directories: ['assets', 'config']
    }
  };

  await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });

  // Create brand structures
  for (const brand of ['brand-a', 'brand-b', 'brand-c']) {
    const brandPath = path.join(BRANDS_DIR, brand);
    await fs.ensureDir(path.join(brandPath, 'assets'));
    await fs.ensureDir(path.join(brandPath, 'config'));
    await fs.ensureDir(path.join(brandPath, 'styles'));

    await fs.writeFile(
      path.join(brandPath, 'assets', 'logo.png'),
      `${brand} logo content`
    );

    await fs.writeJson(
      path.join(brandPath, 'config', 'app.config.json'),
      {
        brandName: brand === 'brand-a' ? 'Brand A' : brand === 'brand-b' ? 'Brand B' : 'Brand C',
        primaryColor: brand === 'brand-a' ? '#ff0000' : brand === 'brand-b' ? '#00ff00' : '#0000ff',
        apiUrl: `https://api.${brand}.com`
      },
      { spaces: 2 }
    );

    await fs.writeFile(
      path.join(brandPath, 'styles', 'brand.css'),
      `/* ${brand} styles */`
    );
  }
}

async function createProjectFiles(): Promise<void> {
  // Create original project files
  await fs.ensureDir('src/assets');
  await fs.ensureDir('src/config');
  await fs.ensureDir('src/styles/brand');

  await fs.writeFile('src/assets/logo.png', 'original logo');
  await fs.writeJson('src/config/app.config.json', {
    brandName: 'Original',
    primaryColor: '#000000',
    apiUrl: 'https://api.original.com'
  });
  await fs.writeFile('src/styles/brand/brand.css', '/* original styles */');
}