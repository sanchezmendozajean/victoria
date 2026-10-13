// Public surface of the document core. Pure TypeScript: no DOM, no Electron, no React.
export * from './model/types';
export * from './model/ids';
export * from './model/matrix';
export * from './model/presets';
export * from './model/factory';
export * from './model/queries';
export * from './model/clone';
export { deepClone } from './model/deepClone';
export * from './commands';
export * from './selection/selection';
export { writeVict, readVict, peekVict } from './io/vict';
export type { VictContents, VictManifest, VictWriteInput } from './io/vict';
export { assertDocument, DocumentFormatError } from './io/validate';
export { migrateDocument, UnsupportedVersionError, MIGRATIONS } from './io/migrations';
export { AutosavePolicy, AUTOSAVE_INTERVAL_MS } from './autosave/policy';
