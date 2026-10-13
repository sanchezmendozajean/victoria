import type { DocumentColorMode, Units } from '../model/types';
import type { Command } from './command';

export const renameDocument = (name: string): Command => ({
  label: 'document.rename',
  apply: (d) => {
    d.meta.name = name;
  },
});

export const setUnits = (units: Units): Command => ({
  label: 'document.units',
  apply: (d) => {
    d.meta.units = units;
  },
});

export const setColorMode = (mode: DocumentColorMode): Command => ({
  label: 'document.colorMode',
  apply: (d) => {
    d.meta.colorMode = mode;
  },
});
