#!/usr/bin/env node

export { BrandSwitcher } from './brand-switcher-main';
export { default } from './brand-switcher-main';

// If this module is executed directly, run the CLI
if (require.main === module) {
  // Import and run the CLI
  require('./brand-switcher-main');
}
