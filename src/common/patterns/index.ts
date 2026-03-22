/**
 * Common Patterns Module Index
 *
 * Centralized exports for module organization patterns and utilities
 */

// Module structure patterns
export * from './module.structure';

// Import/export patterns
export * from './import.export.patterns';

// Dependency injection patterns
export * from './dependency.injection';

// Module organization service
export * from './module.organization.service';

/**
 * Re-export commonly used utilities
 */
export {
  ModuleStructureUtils,
  STANDARD_MODULE_STRUCTURE,
  NAMING_CONVENTIONS,
  MODULE_DOCUMENTATION_TEMPLATE,
  SERVICE_DOCUMENTATION_TEMPLATE,
  CONTROLLER_DOCUMENTATION_TEMPLATE,
} from './module.structure';

export {
  ImportOrganizer,
  ExportOrganizer,
  CodeFormatter,
  STANDARD_IMPORT_PATTERNS,
  STANDARD_EXPORT_PATTERNS,
} from './import.export.patterns';

export {
  DIUtils,
  CircularDependencyUtils,
  TestDIUtils,
  STANDARD_INJECTION_PATTERNS,
  REPOSITORY_INJECTION_PATTERNS,
  SERVICE_INJECTION_PATTERNS,
  GUARD_INTERCEPTOR_PATTERNS,
} from './dependency.injection';
