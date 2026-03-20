const fs = require('fs');
const path = require('path');

describe('Project Structure', () => {
  test('should have package.json with correct configuration', () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    expect(fs.existsSync(packageJsonPath)).toBe(true);

    const packageJson = require(packageJsonPath);
    expect(packageJson.name).toBe('pruner');
    expect(packageJson.main).toBe('./dist/index.js');
    expect(packageJson.bin.pruner).toBe('./dist/index.js');
  });

  test('should have tsconfig.json with correct configuration', () => {
    const tsconfigPath = path.join(__dirname, '..', 'tsconfig.json');
    expect(fs.existsSync(tsconfigPath)).toBe(true);

    const tsconfig = require(tsconfigPath);
    expect(tsconfig.compilerOptions.target).toBe('ES2022');
    expect(tsconfig.compilerOptions.module).toBe('CommonJS');
  });

  test('should have required source files', () => {
    const srcPath = path.join(__dirname, '..', 'src');

    // Main files
    expect(fs.existsSync(path.join(srcPath, 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(srcPath, 'proxy.ts'))).toBe(true);
    expect(fs.existsSync(path.join(srcPath, 'config.ts'))).toBe(true);

    // Optimizer files
    expect(fs.existsSync(path.join(srcPath, 'optimizer', 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(srcPath, 'optimizer', 'cache.ts'))).toBe(true);
    expect(fs.existsSync(path.join(srcPath, 'optimizer', 'pruner.ts'))).toBe(true);
    expect(fs.existsSync(path.join(srcPath, 'optimizer', 'truncate.ts'))).toBe(true);

    // Stats files
    expect(fs.existsSync(path.join(srcPath, 'stats', 'counter.ts'))).toBe(true);
    expect(fs.existsSync(path.join(srcPath, 'stats', 'db.ts'))).toBe(true);
    expect(fs.existsSync(path.join(srcPath, 'stats', 'report.ts'))).toBe(true);

    // UI files
    expect(fs.existsSync(path.join(srcPath, 'ui', 'banner.ts'))).toBe(true);
  });

  test('should have compiled output after build', () => {
    const distPath = path.join(__dirname, '..', 'dist');
    expect(fs.existsSync(distPath)).toBe(true);
    expect(fs.existsSync(path.join(distPath, 'index.js'))).toBe(true);
  });
});