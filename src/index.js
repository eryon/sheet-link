import * as rolodex from './rolodex';
import * as tablink from './tablink';

export const MODULE_ID = 'sheet-link';

export const localize = (key, ...args) => game.i18n.format(`${MODULE_ID}.${key}`, ...args);

Hooks.once('init', () => {
  rolodex.registerSettings();
  tablink.registerSettings();
});

Hooks.once('ready', () => {
  rolodex.setup();
  tablink.setup();
});
