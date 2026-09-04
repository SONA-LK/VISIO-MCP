/**
 * Imports the builtin diagram types so they self-register with the registry.
 * Import this module (once) before calling registry.get()/allSpecs().
 */

import './activity';
import './flowchart';

export * from './registry';
