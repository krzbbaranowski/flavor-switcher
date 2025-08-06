import Joi from 'joi';
import { Configuration } from './types';

export const CONFIG_FILE = 'flavor-config.json';
export const STATE_FILE = '.flavor-state.json';
export const FLAVORS_DIR = 'flavors';
export const BACKUP_DIR = '.flavor-backup';
export const GITIGNORE_MARKER = '# Flavor Switcher - DO NOT EDIT BELOW THIS LINE';

export const configSchema = Joi.object<Configuration>({
  version: Joi.string().required(),
  projectRoot: Joi.string().default('./'),
  flavors: Joi.object().pattern(
    Joi.string(),
    Joi.object({
      displayName: Joi.string().required(),
      description: Joi.string().optional(),
      active: Joi.boolean().default(true)
    })
  ).required(),
  mappings: Joi.array().items(
    Joi.object({
      source: Joi.string().required(),
      target: Joi.string().required(),
      type: Joi.string().valid('file', 'directory').default('file'),
      required: Joi.boolean().default(true),
      description: Joi.string().optional()
    })
  ).required(),
  requiredStructure: Joi.object({
    files: Joi.array().items(Joi.string()).default([]),
    directories: Joi.array().items(Joi.string()).default([])
  }).default({ files: [], directories: [] })
}).required();