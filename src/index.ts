#!/usr/bin/env node

export { FlavorSwitcher } from './flavor-switcher';
export { default } from './flavor-switcher';
export * from './types';
export * from './constants';

if (require.main === module) {
  const { program } = require('./cli');
  program.parse(process.argv);
}
