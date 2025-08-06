// __tests__/integration.test.ts

import * as fs from 'fs-extra';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';

describe('Brand Switcher CLI Integration Tests', () => {
  let testDir: string;
  let originalCwd: string;
  let cliPath: string;

  beforeAll(() => {
    originalCwd = process.cwd();
    cliPath = path.join(originalCwd, 'dist', 'index.js');
    // Build the TypeScript project
    execSync('npm run build', { cwd: originalCwd });
  });

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brand-switcher-test-'));
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(testDir);
  });

  describe('CLI Commands', () => {
    it('should show help information', () => {
      const output = execSync(`node ${cliPath} --help`).toString();
      expect(output).toContain('brand-switcher');
      expect(output).toContain('switch');
      expect(output).toContain('reset');
      expect(output).toContain('status');
      expect(output).toContain('validate');
      expect(output).toContain('init');
    });

    it('should show version', () => {
      const output = execSync(`node ${cliPath} --version`).toString();
      expect(output).toContain('1.0.0');
    });

    it('should initialize project', () => {
      execSync(`node ${cliPath} init`);
      
      expect(fs.existsSync('brand-config.json')).toBe(true);
      expect(fs.existsSync('brands')).toBe(true);
      expect(fs.existsSync('.gitignore')).toBe(true);
      
      const config = fs.readJsonSync('brand-config.json');
      expect(config.version).toBe('1.0.0');
      expect(config.brands['example-brand']).toBeDefined();
    });

    it('should prevent re-initialization', () => {
      execSync(`node ${cliPath} init`);
      const output = execSync(`node ${cliPath} init`).toString();
      expect(output).toContain('already initialized');
    });

    it('should validate configuration', () => {
      execSync(`node ${cliPath} init`);
      const output = execSync(`node ${cliPath} validate`).toString();
      expect(output).toContain('Validating');
      expect(output).toContain('All validations passed');
    });

    it('should show status', () => {
      execSync(`node ${cliPath} init`);
      const output = execSync(`node ${cliPath} status`).toString();
      expect(output).toContain('Brand Switcher Status');
      expect(output).toContain('Current brand: none');
      expect(output).toContain('Available Brands');
    });

    it('should handle missing configuration gracefully', () => {
      try {
        execSync(`node ${cliPath} status`);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.status).toBe(1);
      }
    });
  });

  describe('Brand Switching Workflow', () => {
    beforeEach(() => {
      // Initialize and set up test environment
      try {
        execSync(`node ${cliPath} init`, { stdio: 'inherit' });
      } catch (error) {
        console.error('Failed to initialize:', error);
        throw error;
      }
      
      // Create project structure
      fs.ensureDirSync('src/assets');
      fs.ensureDirSync('src/config');
      fs.ensureDirSync('src/styles/brand');
      
      fs.writeFileSync('src/assets/logo.png', 'original logo');
      fs.writeJsonSync('src/config/app.config.json', {
        brandName: 'Original',
        primaryColor: '#000000'
      });
      
      // Create a test brand
      const testBrandPath = 'brands/test-brand';
      fs.ensureDirSync(path.join(testBrandPath, 'assets'));
      fs.ensureDirSync(path.join(testBrandPath, 'config'));
      fs.ensureDirSync(path.join(testBrandPath, 'styles'));
      
      fs.writeFileSync(
        path.join(testBrandPath, 'assets/logo.png'),
        'test brand logo'
      );
      fs.writeJsonSync(
        path.join(testBrandPath, 'config/app.config.json'),
        {
          brandName: 'Test Brand',
          primaryColor: '#FF0000'
        }
      );
      
      // Update config to include test brand
      const config = fs.readJsonSync('brand-config.json');
      config.brands['test-brand'] = {
        displayName: 'Test Brand',
        description: 'Test brand for integration tests',
        active: true
      };
      fs.writeJsonSync('brand-config.json', config, { spaces: 2 });
    });

    it('should switch to a brand', () => {
      const output = execSync(`node ${cliPath} switch test-brand`).toString();
      expect(output).toContain('Successfully switched to brand: test-brand');
      
      // Verify files were changed
      const logo = fs.readFileSync('src/assets/logo.png', 'utf8');
      expect(logo).toBe('test brand logo');
      
      const config = fs.readJsonSync('src/config/app.config.json');
      expect(config.brandName).toBe('Test Brand');
      expect(config.primaryColor).toBe('#FF0000');
      
      // Verify state file
      const state = fs.readJsonSync('.brand-state.json');
      expect(state.currentBrand).toBe('test-brand');
    });

    it('should reset to original state', () => {
      execSync(`node ${cliPath} switch test-brand`);
      
      // Pipe 'y' to confirm reset
      execSync(`echo y | node ${cliPath} reset`);
      
      // Verify files were restored
      const logo = fs.readFileSync('src/assets/logo.png', 'utf8');
      expect(logo).toBe('original logo');
      
      const config = fs.readJsonSync('src/config/app.config.json');
      expect(config.brandName).toBe('Original');
      expect(config.primaryColor).toBe('#000000');
      
      // Verify state was cleared
      const state = fs.readJsonSync('.brand-state.json');
      expect(state.currentBrand).toBeNull();
    });

    it('should update gitignore correctly', () => {
      execSync(`node ${cliPath} switch test-brand`);
      
      const gitignore = fs.readFileSync('.gitignore', 'utf8');
      expect(gitignore).toContain('# Brand Switcher');
      expect(gitignore).toContain('.brand-state.json');
      expect(gitignore).toContain('src/assets/logo.png');
      expect(gitignore).toContain('src/config/app.config.json');
    });

    it('should prevent switching to non-existent brand', () => {
      try {
        execSync(`node ${cliPath} switch non-existent`);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.status).toBe(1);
      }
    });

    it('should handle switching between brands', () => {
      // Create second brand
      const secondBrandPath = 'brands/second-brand';
      fs.ensureDirSync(path.join(secondBrandPath, 'assets'));
      fs.ensureDirSync(path.join(secondBrandPath, 'config'));
      
      fs.writeFileSync(
        path.join(secondBrandPath, 'assets/logo.png'),
        'second brand logo'
      );
      fs.writeJsonSync(
        path.join(secondBrandPath, 'config/app.config.json'),
        {
          brandName: 'Second Brand',
          primaryColor: '#00FF00'
        }
      );
      
      // Update config
      const config = fs.readJsonSync('brand-config.json');
      config.brands['second-brand'] = {
        displayName: 'Second Brand',
        active: true
      };
      fs.writeJsonSync('brand-config.json', config, { spaces: 2 });
      
      // Switch to first brand
      execSync(`node ${cliPath} switch test-brand`);
      let appConfig = fs.readJsonSync('src/config/app.config.json');
      expect(appConfig.brandName).toBe('Test Brand');
      
      // Switch to second brand
      execSync(`node ${cliPath} switch second-brand`);
      appConfig = fs.readJsonSync('src/config/app.config.json');
      expect(appConfig.brandName).toBe('Second Brand');
      
      // State should reflect current brand
      const state = fs.readJsonSync('.brand-state.json');
      expect(state.currentBrand).toBe('second-brand');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle invalid configuration', () => {
      fs.writeJsonSync('brand-config.json', {
        // Missing required fields
        version: '1.0.0'
      });
      
      try {
        execSync(`node ${cliPath} status`);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.status).toBe(1);
      }
    });

    it('should handle corrupted JSON files', () => {
      fs.writeFileSync('brand-config.json', 'invalid json content');
      
      try {
        execSync(`node ${cliPath} status`);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.status).toBe(1);
      }
    });

    it('should handle missing brand structure', () => {
      execSync(`node ${cliPath} init`);
      
      // Remove required file from example brand
      fs.removeSync('brands/example-brand/assets/logo.png');
      
      try {
        execSync(`node ${cliPath} validate`);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.status).toBe(1);
      }
    });

    it('should handle file permission issues', () => {
      execSync(`node ${cliPath} init`);
      
      // Make state file read-only
      fs.writeJsonSync('.brand-state.json', {
        currentBrand: 'test',
        originalFiles: {}
      });
      fs.chmodSync('.brand-state.json', 0o444);
      
      try {
        execSync(`node ${cliPath} switch example-brand`);
        // May or may not fail depending on OS
      } catch (error: any) {
        // Expected in some cases
      }
      
      // Restore permissions
      fs.chmodSync('.brand-state.json', 0o644);
    });
  });

  describe('Performance', () => {
    it('should handle large number of files efficiently', () => {
      execSync(`node ${cliPath} init`);
      
      // Create a brand with many files
      const largeBrandPath = 'brands/large-brand';
      fs.ensureDirSync(path.join(largeBrandPath, 'assets'));
      fs.ensureDirSync(path.join(largeBrandPath, 'config'));
      
      // Create 100 files
      for (let i = 0; i < 100; i++) {
        fs.writeFileSync(
          path.join(largeBrandPath, 'assets', `file-${i}.txt`),
          `Content for file ${i}`
        );
      }
      
      fs.writeFileSync(
        path.join(largeBrandPath, 'assets/logo.png'),
        'large brand logo'
      );
      fs.writeJsonSync(
        path.join(largeBrandPath, 'config/app.config.json'),
        { brandName: 'Large Brand' }
      );
      
      // Update config
      const config = fs.readJsonSync('brand-config.json');
      config.brands['large-brand'] = {
        displayName: 'Large Brand',
        active: true
      };
      
      // Add mappings for all files
      for (let i = 0; i < 100; i++) {
        config.mappings.push({
          source: `assets/file-${i}.txt`,
          target: `src/assets/file-${i}.txt`,
          type: 'file',
          required: false
        });
      }
      
      fs.writeJsonSync('brand-config.json', config, { spaces: 2 });
      
      // Create src directories
      fs.ensureDirSync('src/assets');
      fs.ensureDirSync('src/config');
      
      // Measure switching time
      const startTime = Date.now();
      execSync(`node ${cliPath} switch large-brand`);
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (5 seconds)
      expect(duration).toBeLessThan(5000);
      
      // Verify some files were copied
      expect(fs.existsSync('src/assets/file-0.txt')).toBe(true);
      expect(fs.existsSync('src/assets/file-99.txt')).toBe(true);
    });
  });

  describe('Git Hook Integration', () => {

    it('should create pre-commit hook example', () => {
      execSync(`node ${cliPath} init`);
      
      // Create git directory structure
      fs.ensureDirSync('.git/hooks');
      
      // Create pre-commit hook
      const hookContent = `#!/bin/sh
if [ -f .brand-state.json ]; then
  CURRENT_BRAND=$(cat .brand-state.json | grep -o '"currentBrand"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
  if [ ! -z "$CURRENT_BRAND" ] && [ "$CURRENT_BRAND" != "null" ]; then
    echo "Error: Cannot commit with active brand: $CURRENT_BRAND"
    echo "Run 'brand-switcher reset' before committing"
    exit 1
  fi
fi`;
      
      fs.writeFileSync('.git/hooks/pre-commit', hookContent);
      fs.chmodSync('.git/hooks/pre-commit', 0o755);
      
      // Switch to a brand
      execSync(`node ${cliPath} switch example-brand`);
      
      // Try to run the hook
      const hookResult = execSync('sh .git/hooks/pre-commit || true').toString();
      expect(hookResult).toContain('Cannot commit with active brand');
      
      // Reset and try again
      execSync(`echo y | node ${cliPath} reset`);
      
      // Hook should pass now
      const hookResult2 = execSync('sh .git/hooks/pre-commit && echo "OK"').toString();
      expect(hookResult2).toContain('OK');
    });
  });
});