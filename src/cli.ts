#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import { FlavorSwitcher } from './flavor-switcher';

export const program = new Command();

program
  .name('flavor-switcher')
  .description('CLI tool for managing white-label application resources')
  .version('1.0.0');

program
  .command('switch [flavor]')
  .description('Switch to a specific flavor or select interactively')
  .action(async (flavor?: string) => {
    const switcher = new FlavorSwitcher();
    await switcher.init();
    
    if (flavor) {
      await switcher.switchFlavor(flavor);
    } else {
      await switcher.interactiveSwitch();
    }
  });

program
  .command('reset')
  .description('Reset to original state (remove all flavor customizations)')
  .action(async () => {
    const switcher = new FlavorSwitcher();
    await switcher.init();
    
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to reset to original state?',
        default: false
      }
    ]);
    
    if (confirm) {
      await switcher.resetFlavor();
    }
  });

program
  .command('status')
  .description('Show current flavor status')
  .action(async () => {
    const switcher = new FlavorSwitcher();
    await switcher.init();
    await switcher.checkStatus();
  });

program
  .command('validate')
  .description('Validate configuration and flavor structures')
  .action(async () => {
    const switcher = new FlavorSwitcher();
    await switcher.init();
    await switcher.validate();
  });

program
  .command('init')
  .description('Initialize flavor switcher in current directory')
  .action(async () => {
    await FlavorSwitcher.initProject();
  });

if (require.main === module) {
  program.parse(process.argv);
}