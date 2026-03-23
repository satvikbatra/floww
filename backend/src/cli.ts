#!/usr/bin/env node
/**
 * Floww CLI - Command-line interface for autonomous SaaS documentation
 */

import { Command } from 'commander';
import { ConfigValidator, ProjectConfig } from './utils/config-validator.js';
import { existsSync } from 'fs';
import { writeFileSync } from 'fs';
import { join } from 'path';

const program = new Command();

program
  .name('floww')
  .description('Floww - Autonomous SaaS Documentation Generator')
  .version('1.0.0');

/**
 * Init command - Create new project configuration
 */
program
  .command('init')
  .description('Initialize a new Floww project')
  .option('--url <url>', 'Base URL to crawl')
  .option('--name <name>', 'Project name')
  .action(async (options) => {
    try {
      let baseUrl = options.url;
      let name = options.name;

      if (!baseUrl) {
        console.error('❌ Error: --url is required');
        console.log('\nUsage:');
        console.log('  floww init --url https://your-saas-app.com --name "My Project"');
        process.exit(1);
      }

      if (!name) {
        // Derive name from URL
        const url = new URL(baseUrl);
        name = url.hostname.replace('www.', '').replace(/\.[^.]+$/, '');
      }

      // Create default configuration
      const config = ConfigValidator.createDefault(name, baseUrl);

      // Write to floww.yaml
      const yamlContent = ConfigValidator.toYaml(config);
      const configPath = join(process.cwd(), 'floww.yaml');

      if (existsSync(configPath)) {
        console.log('⚠️  floww.yaml already exists. Use --force to overwrite.');
        process.exit(1);
      }

      writeFileSync(configPath, yamlContent);

      console.log('✅ Created floww.yaml');
      console.log('\nNext steps:');
      console.log('  1. Edit floww.yaml to customize your project');
      console.log('  2. Run: floww crawl');
      console.log('\nConfiguration saved to:', configPath);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

/**
 * Crawl command - Start crawling
 */
program
  .command('crawl')
  .description('Start crawling a SaaS application')
  .option('--url <url>', 'URL to crawl (overrides config)')
  .option('--config <path>', 'Path to config file', 'floww.yaml')
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser with UI')
  .option('--auto', 'Auto mode - skip all prompts')
  .option('--pages <number>', 'Maximum pages to crawl', '50')
  .action(async (options) => {
    try {
      let config: ProjectConfig;

      if (options.url) {
        // Create config from URL
        const url = new URL(options.url);
        const name = url.hostname.replace('www.', '').replace(/\.[^.]+$/, '');
        config = ConfigValidator.createDefault(name, options.url);
        config.scope!.maxPages = parseInt(options.pages);
      } else {
        // Load from config file
        if (!existsSync(options.config)) {
          console.error(`❌ Error: Config file not found: ${options.config}`);
          console.log('\nOptions:');
          console.log('  1. Run: floww init --url https://your-saas-app.com');
          console.log('  2. Or: floww crawl --url https://your-saas-app.com');
          process.exit(1);
        }

        config = ConfigValidator.loadYamlConfig(options.config);
      }

      // Display project info
      console.log('🚀 Starting Floww crawl');
      console.log('━'.repeat(60));
      console.log(`  Project: ${config.name}`);
      console.log(`  URL: ${config.baseUrl}`);
      console.log(`  Max Pages: ${config.scope?.maxPages || 100}`);
      console.log(`  Headless: ${options.headless ? 'Yes' : 'No'}`);
      console.log(`  Auto Mode: ${options.auto ? 'Yes' : 'No'}`);
      console.log('━'.repeat(60));
      console.log();

      console.log('⚠️  Note: Backend API server must be running for full functionality.');
      console.log('    Start the backend server with: cd backend && npm run dev');
      console.log();
      console.log('📝 For full CLI support with integrated crawler, run:');
      console.log('    npm run crawl -- --url ' + config.baseUrl);
      console.log();

      // In a full implementation, this would start the crawler
      // For now, we direct users to use the API
      console.log('💡 Use the REST API to start crawling:');
      console.log(`    POST http://localhost:8000/api/v1/projects`);
      console.log(`    {`);
      console.log(`      "name": "${config.name}",`);
      console.log(`      "baseUrl": "${config.baseUrl}"`);
      console.log(`    }`);
      console.log();
      console.log(`    POST http://localhost:8000/api/v1/projects/:id/crawl/start`);

    } catch (error: any) {
      console.error('❌ Error:', error.message);
      if (error.errors) {
        error.errors.forEach((err: string) => console.error(`  - ${err}`));
      }
      process.exit(1);
    }
  });

/**
 * Validate command - Validate configuration
 */
program
  .command('validate')
  .description('Validate floww.yaml configuration')
  .option('--config <path>', 'Path to config file', 'floww.yaml')
  .action(async (options) => {
    try {
      if (!existsSync(options.config)) {
        console.error(`❌ Error: Config file not found: ${options.config}`);
        process.exit(1);
      }

      const config = ConfigValidator.loadYamlConfig(options.config);

      console.log('✅ Configuration is valid');
      console.log('\nProject Details:');
      console.log(`  Name: ${config.name}`);
      console.log(`  URL: ${config.baseUrl}`);
      console.log(`  Max Pages: ${config.scope?.maxPages || 'default'}`);
      console.log(`  Max Depth: ${config.scope?.maxDepth || 'default'}`);
      console.log(`  Auth Type: ${config.auth?.type || 'none'}`);
      console.log(`  Output Formats: ${config.output?.formats?.join(', ') || 'markdown'}`);
    } catch (error: any) {
      console.error('❌ Validation failed');
      if (error.errors) {
        console.log('\nErrors:');
        error.errors.forEach((err: string) => console.error(`  - ${err}`));
      } else {
        console.error(`  ${error.message}`);
      }
      process.exit(1);
    }
  });

/**
 * Status command - Check backend status
 */
program
  .command('status')
  .description('Check Floww backend status')
  .option('--url <url>', 'Backend URL', 'http://localhost:8000')
  .action(async (options) => {
    try {
      const response = await fetch(`${options.url}/health`);
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Backend is healthy');
        console.log(`   Status: ${data.status}`);
        console.log(`   Version: ${data.version || 'N/A'}`);
      } else {
        console.log('⚠️  Backend is not responding properly');
        console.log(`   Status: ${response.status}`);
      }
    } catch (error: any) {
      console.log('❌ Cannot connect to backend');
      console.log(`   URL: ${options.url}`);
      console.log(`   Error: ${error.message}`);
      console.log('\nMake sure the backend is running:');
      console.log('   cd backend && npm run dev');
    }
  });

program.parse();
