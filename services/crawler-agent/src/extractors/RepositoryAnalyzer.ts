/**
 * Repository Analyzer - Extractor 1
 * Detects languages, frameworks, and custom components
 */

import fs from 'fs/promises';
import path from 'path';
import { parseString as parseXML } from 'xml2js';
import yaml from 'js-yaml';
import toml from 'toml';
import { treeSitterParser, SupportedLanguage } from '../utils/treeSitterUtil.js';
import { logger } from '../utils/logger.js';
import { globby } from 'globby';

export interface FrameworkFingerprint {
  framework_type: string;
  framework_version?: string;
  is_custom: boolean;
  package_name?: string;
  custom_components: Array<{
    name: string;
    type: string;
    usage: string;
    occurrence_count?: number;
  }>;
  dependency_file?: string;
  config_namespaces: string[];
  detected_languages: Record<string, number>;
  metadata: Record<string, any>;
}

export interface DependencyInfo {
  name: string;
  version: string;
  group?: string;
  isCustom: boolean;
}

export class RepositoryAnalyzer {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Main analysis entry point
   */
  async analyze(): Promise<FrameworkFingerprint[]> {
    logger.info(`Starting repository analysis: ${this.repoPath}`);
    const startTime = Date.now();

    try {
      // Step 1: Detect languages
      const languages = await this.detectLanguages();
      logger.info('Detected languages:', languages);

      // Step 2: Extract dependencies
      const dependencies = await this.extractDependencies(languages);
      logger.info(`Found ${dependencies.length} dependencies`);

      // Step 3: Detect custom frameworks
      const customFrameworks = await this.detectCustomFrameworks(dependencies);
      logger.info(`Found ${customFrameworks.length} custom frameworks`);

      // Step 4: Extract custom components for each framework
      const fingerprints: FrameworkFingerprint[] = [];

      for (const dep of dependencies) {
        const isCustom = this.isCustomPackage(dep.name);
        
        const fingerprint: FrameworkFingerprint = {
          framework_type: this.identifyFrameworkType(dep.name),
          framework_version: dep.version,
          is_custom: isCustom,
          package_name: dep.group ? `${dep.group}:${dep.name}` : dep.name,
          custom_components: [],
          dependency_file: dep.source,
          config_namespaces: [],
          detected_languages: languages,
          metadata: {
            group: dep.group,
            source: dep.source,
          },
        };

        // If custom framework, extract components
        if (isCustom) {
          fingerprint.custom_components = await this.extractCustomComponents(dep, languages);
          fingerprint.config_namespaces = await this.detectConfigNamespaces();
        }

        fingerprints.push(fingerprint);
      }

      const duration = Date.now() - startTime;
      logger.info(`Repository analysis completed in ${duration}ms`);

      return fingerprints;
    } catch (error) {
      logger.error('Repository analysis failed:', error);
      throw error;
    }
  }

  /**
   * Detect programming languages in repository
   */
  private async detectLanguages(): Promise<Record<string, number>> {
    const languageCounts: Record<string, number> = {};

    const extensionMap: Record<string, string> = {
      '.java': 'java',
      '.py': 'python',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.go': 'go',
      '.rs': 'rust',
      '.cs': 'csharp',
    };

    try {
      const files = await globby('**/*', {
        cwd: this.repoPath,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/target/**'],
        onlyFiles: true,
      });

      for (const file of files) {
        const ext = path.extname(file);
        const lang = extensionMap[ext];
        if (lang) {
          languageCounts[lang] = (languageCounts[lang] || 0) + 1;
        }
      }
    } catch (error) {
      logger.error('Language detection failed:', error);
    }

    return languageCounts;
  }

  /**
   * Extract dependencies from various package managers
   */
  private async extractDependencies(languages: Record<string, number>): Promise<Array<DependencyInfo & { source?: string }>> {
    const dependencies: Array<DependencyInfo & { source?: string }> = [];

    // Java dependencies
    if (languages.java) {
      const mavenDeps = await this.extractMavenDependencies();
      dependencies.push(...mavenDeps);

      const gradleDeps = await this.extractGradleDependencies();
      dependencies.push(...gradleDeps);
    }

    // Python dependencies
    if (languages.python) {
      const pythonDeps = await this.extractPythonDependencies();
      dependencies.push(...pythonDeps);
    }

    // Node.js dependencies
    if (languages.javascript || languages.typescript) {
      const nodeDeps = await this.extractNodeDependencies();
      dependencies.push(...nodeDeps);
    }

    // Go dependencies
    if (languages.go) {
      const goDeps = await this.extractGoDependencies();
      dependencies.push(...goDeps);
    }

    // Rust dependencies
    if (languages.rust) {
      const rustDeps = await this.extractRustDependencies();
      dependencies.push(...rustDeps);
    }

    return dependencies;
  }

  /**
   * Extract Maven dependencies from pom.xml
   */
  private async extractMavenDependencies(): Promise<Array<DependencyInfo & { source?: string }>> {
    const dependencies: Array<DependencyInfo & { source?: string }> = [];

    try {
      const pomPaths = await globby('**/pom.xml', {
        cwd: this.repoPath,
        ignore: ['**/node_modules/**', '**/target/**'],
      });

      for (const pomPath of pomPaths) {
        const fullPath = path.join(this.repoPath, pomPath);
        const content = await fs.readFile(fullPath, 'utf-8');

        const result: any = await new Promise((resolve, reject) => {
          parseXML(content, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        const deps = result?.project?.dependencies?.[0]?.dependency || [];
        for (const dep of deps) {
          const groupId = dep.groupId?.[0];
          const artifactId = dep.artifactId?.[0];
          const version = dep.version?.[0];

          if (groupId && artifactId) {
            dependencies.push({
              name: artifactId,
              version: version || 'unknown',
              group: groupId,
              isCustom: this.isCustomPackage(`${groupId}.${artifactId}`),
              source: pomPath,
            });
          }
        }
      }
    } catch (error) {
      logger.debug('Maven dependency extraction skipped:', error);
    }

    return dependencies;
  }

  /**
   * Extract Gradle dependencies from build.gradle
   */
  private async extractGradleDependencies(): Promise<Array<DependencyInfo & { source?: string }>> {
    const dependencies: Array<DependencyInfo & { source?: string }> = [];

    try {
      const gradlePaths = await globby('**/build.gradle*', {
        cwd: this.repoPath,
        ignore: ['**/node_modules/**', '**/build/**'],
      });

      for (const gradlePath of gradlePaths) {
        const fullPath = path.join(this.repoPath, gradlePath);
        const content = await fs.readFile(fullPath, 'utf-8');

        // Simple regex to extract dependencies (not perfect but good enough)
        const depRegex = /['"]([^:'"]+):([^:'"]+):([^'"]+)['"]/g;
        let match;

        while ((match = depRegex.exec(content)) !== null) {
          const [, group, name, version] = match;
          dependencies.push({
            name,
            version,
            group,
            isCustom: this.isCustomPackage(`${group}.${name}`),
            source: gradlePath,
          });
        }
      }
    } catch (error) {
      logger.debug('Gradle dependency extraction skipped:', error);
    }

    return dependencies;
  }

  /**
   * Extract Python dependencies
   */
  private async extractPythonDependencies(): Promise<Array<DependencyInfo & { source?: string }>> {
    const dependencies: Array<DependencyInfo & { source?: string }> = [];

    try {
      // requirements.txt
      const reqPaths = await globby('**/requirements*.txt', {
        cwd: this.repoPath,
        ignore: ['**/node_modules/**', '**/venv/**', '**/.venv/**'],
      });

      for (const reqPath of reqPaths) {
        const fullPath = path.join(this.repoPath, reqPath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          const match = trimmed.match(/^([a-zA-Z0-9_-]+)==?([0-9.]+)?/);
          if (match) {
            const [, name, version] = match;
            dependencies.push({
              name,
              version: version || 'latest',
              isCustom: this.isCustomPackage(name),
              source: reqPath,
            });
          }
        }
      }
    } catch (error) {
      logger.debug('Python dependency extraction skipped:', error);
    }

    return dependencies;
  }

  /**
   * Extract Node.js dependencies from package.json
   */
  private async extractNodeDependencies(): Promise<Array<DependencyInfo & { source?: string }>> {
    const dependencies: Array<DependencyInfo & { source?: string }> = [];

    try {
      const pkgPaths = await globby('**/package.json', {
        cwd: this.repoPath,
        ignore: ['**/node_modules/**'],
      });

      for (const pkgPath of pkgPaths) {
        const fullPath = path.join(this.repoPath, pkgPath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const pkg = JSON.parse(content);

        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        for (const [name, version] of Object.entries(allDeps)) {
          dependencies.push({
            name,
            version: version as string,
            isCustom: this.isCustomPackage(name),
            source: pkgPath,
          });
        }
      }
    } catch (error) {
      logger.debug('Node dependency extraction skipped:', error);
    }

    return dependencies;
  }

  /**
   * Extract Go dependencies from go.mod
   */
  private async extractGoDependencies(): Promise<Array<DependencyInfo & { source?: string }>> {
    const dependencies: Array<DependencyInfo & { source?: string }> = [];

    try {
      const goModPath = path.join(this.repoPath, 'go.mod');
      const content = await fs.readFile(goModPath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const match = line.trim().match(/^([^\s]+)\s+v([0-9.]+)/);
        if (match) {
          const [, name, version] = match;
          dependencies.push({
            name,
            version,
            isCustom: this.isCustomPackage(name),
            source: 'go.mod',
          });
        }
      }
    } catch (error) {
      logger.debug('Go dependency extraction skipped:', error);
    }

    return dependencies;
  }

  /**
   * Extract Rust dependencies from Cargo.toml
   */
  private async extractRustDependencies(): Promise<Array<DependencyInfo & { source?: string }>> {
    const dependencies: Array<DependencyInfo & { source?: string }> = [];

    try {
      const cargoPath = path.join(this.repoPath, 'Cargo.toml');
      const content = await fs.readFile(cargoPath, 'utf-8');
      const parsed: any = toml.parse(content);

      const deps = parsed.dependencies || {};
      for (const [name, value] of Object.entries(deps)) {
        const version = typeof value === 'string' ? value : (value as any).version || 'unknown';
        dependencies.push({
          name,
          version,
          isCustom: this.isCustomPackage(name),
          source: 'Cargo.toml',
        });
      }
    } catch (error) {
      logger.debug('Rust dependency extraction skipped:', error);
    }

    return dependencies;
  }

  /**
   * Detect if package is custom (internal)
   */
  private isCustomPackage(packageName: string): boolean {
    const customPatterns = [
      /^com\.(abc|internal|company|mycompany)\./,
      /^@(company|internal|abc)\//,
      /^(company|internal)_/,
      /r1-core/,
      /ginger/i,
    ];

    return customPatterns.some((pattern) => pattern.test(packageName));
  }

  /**
   * Identify framework type from package name
   */
  private identifyFrameworkType(packageName: string): string {
    if (packageName.includes('spring')) return 'Spring Boot';
    if (packageName.includes('django')) return 'Django';
    if (packageName.includes('express')) return 'Express';
    if (packageName.includes('react')) return 'React';
    if (packageName.includes('vue')) return 'Vue.js';
    if (packageName.includes('angular')) return 'Angular';
    if (packageName.includes('nest')) return 'NestJS';
    if (packageName.includes('fastapi')) return 'FastAPI';
    if (packageName.includes('flask')) return 'Flask';
    return 'Unknown';
  }

  /**
   * Detect custom frameworks from dependencies
   */
  private async detectCustomFrameworks(dependencies: DependencyInfo[]): Promise<DependencyInfo[]> {
    return dependencies.filter((dep) => dep.isCustom);
  }

  /**
   * Extract custom components from framework code
   */
  private async extractCustomComponents(
    framework: DependencyInfo,
    languages: Record<string, number>
  ): Promise<Array<{ name: string; type: string; usage: string; occurrence_count?: number }>> {
    const components: Array<{ name: string; type: string; usage: string; occurrence_count?: number }> = [];

    try {
      // Search for framework files
      const primaryLang = Object.keys(languages).sort((a, b) => languages[b] - languages[a])[0];

      if (primaryLang === 'java') {
        // Search for classes in custom package
        const javaFiles = await globby('**/*.java', {
          cwd: this.repoPath,
          ignore: ['**/node_modules/**', '**/target/**', '**/build/**'],
        });

        for (const file of javaFiles.slice(0, 50)) {
          // Limit to first 50 files
          const fullPath = path.join(this.repoPath, file);
          const content = await fs.readFile(fullPath, 'utf-8');

          const classes = treeSitterParser.extractJavaClasses(content);

          for (const cls of classes) {
            // Check if it's likely a framework component
            if (cls.name.includes('Client') || cls.name.includes('Service') || cls.name.includes('Repository')) {
              components.push({
                name: cls.name,
                type: 'class',
                usage: this.inferUsage(cls.name),
              });
            }
          }
        }
      }

      // Count occurrences
      for (const component of components) {
        component.occurrence_count = await this.countComponentUsage(component.name);
      }
    } catch (error) {
      logger.error('Custom component extraction failed:', error);
    }

    return components;
  }

  /**
   * Infer usage from component name
   */
  private inferUsage(componentName: string): string {
    if (componentName.includes('Client')) return 'HTTP client wrapper';
    if (componentName.includes('Service')) return 'Service layer';
    if (componentName.includes('Repository')) return 'Data access layer';
    if (componentName.includes('Controller')) return 'REST controller';
    if (componentName.includes('Response')) return 'Response wrapper';
    return 'Unknown';
  }

  /**
   * Count component usage across codebase
   */
  private async countComponentUsage(componentName: string): Promise<number> {
    try {
      const files = await globby('**/*', {
        cwd: this.repoPath,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
        onlyFiles: true,
      });

      let count = 0;
      for (const file of files) {
        const fullPath = path.join(this.repoPath, file);
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const matches = content.match(new RegExp(componentName, 'g'));
          if (matches) count += matches.length;
        } catch {
          // Skip binary files
        }
      }

      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Detect configuration namespaces
   */
  private async detectConfigNamespaces(): Promise<string[]> {
    const namespaces: Set<string> = new Set();

    try {
      // Check YAML config files
      const yamlFiles = await globby('**/application*.yml', {
        cwd: this.repoPath,
        ignore: ['**/node_modules/**'],
      });

      for (const file of yamlFiles) {
        const fullPath = path.join(this.repoPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');
        const config: any = yaml.load(content);

        // Extract top-level keys
        if (config && typeof config === 'object') {
          Object.keys(config).forEach((key) => {
            if (this.isCustomPackage(key)) {
              namespaces.add(`${key}.*`);
            }
          });
        }
      }
    } catch (error) {
      logger.debug('Config namespace detection skipped:', error);
    }

    return Array.from(namespaces);
  }
}

