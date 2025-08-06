export interface FlavorConfig {
  displayName: string;
  description?: string;
  active: boolean;
}

export interface Mapping {
  source: string;
  target: string;
  type: 'file' | 'directory';
  required: boolean;
  description?: string;
}

export interface RequiredStructure {
  files: string[];
  directories: string[];
}

export interface Configuration {
  version: string;
  projectRoot: string;
  flavors: Record<string, FlavorConfig>;
  mappings: Mapping[];
  requiredStructure: RequiredStructure;
}

export interface FileInfo {
  hash?: string;
  exists: boolean;
  type: 'file' | 'directory';
}

export interface State {
  currentFlavor: string | null;
  originalFiles: Record<string, FileInfo>;
}