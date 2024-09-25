import { localize, MODULE_ID } from './index';

class RolodexApplication extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'rolodex',
      height: 600,
      resizable: true,
      tabs: [
        {
          navSelector: '.sheet-navigation',
          contentSelector: '.sheet-container'
        }
      ],
      template: `modules/sheet-link/static/templates/rolodex.hbs`,
      title: 'sheet-link.rolodex.title',
      width: 800
    });
  }

  constructor() {
    super();

    this._highlights = [];
    this.sheets = {};

    Hooks.on('combatTurnChange', this.onCombatTurnChange.bind(this));
    Hooks.on('deleteCombat', this.onCombatDelete.bind(this));
    Hooks.on('updateCombat', this.onCombatUpdate.bind(this));
  }

  get activeSheet() {
    const el = this.element[0];
    return el?.querySelector('.rolodex-sheet.active > .window-app');
  }

  get rolodexTabs() {
    const el = this.element[0];
    return el?.querySelectorAll('[id^=rolodex-tab-]');
  }

  async activate(sheet) {
    if (!this.sheets[sheet.id]) return;

    await this.maximize();
    this.bringToTop();
    this.activateTab(sheet.id);
  }

  async addSheet(sheet, activate = true) {
    if (!this.rendered) await this._render(true);

    const appId = sheet.dataset.appid;
    const app = ui.windows[appId];
    const el = this.element[0];
    const isActiveCombatant = game.combat?.combatant?.actorId === app.actor.id;
    const sheetId = sheet.id;

    if (this.sheets[sheetId]) {
      return this.activate(sheet);
    }

    this.sheets[sheetId] = { app, appId, defaultPosition: { ...app.position } };

    // for sheets that use the Tagify library, destroy the handler (it will be recreated on re-render)
    // noinspection CssInvalidHtmlTagReference
    const tagify = sheet.querySelector('tagify-tags > input');
    if (tagify) {
      // noinspection JSUnresolvedReference
      tagify.__tagify?.destroy();
    }

    // create tab navigation items
    const tabNav = document.createElement('a');
    tabNav.id = `rolodex-tab-${sheetId}`;
    tabNav.dataset.tab = sheetId;
    tabNav.title = app.actor.name;
    tabNav.append(app.actor.name);
    tabNav.addEventListener('mouseout', this._onTabHoverOut.bind(this));
    tabNav.addEventListener('mouseover', this._onTabHoverIn.bind(this));

    if (isActiveCombatant) {
      tabNav.classList.add('activeCombatant');
    }

    el.querySelector('.sheet-navigation').append(tabNav);

    // create tab content
    const tab = document.createElement('div');
    tab.id = `rolodex-sheet-${sheetId}`;
    tab.dataset.tab = sheetId;
    tab.setAttribute('class', 'tab rolodex-sheet');
    tab.append(sheet);

    const resizeHandle = el.querySelector('.window-resizable-handle');
    resizeHandle.style.zIndex = Math.max(resizeHandle.style.zIndex, app.position.zIndex + 1);

    el.querySelector('.sheet-container').append(tab);

    // adjust size to fit container
    const bounds = el.querySelector('.sheet-container').getBoundingClientRect();
    app.setPosition({ left: 0, top: 0, width: bounds.width, height: bounds.height });
    app.render(true);

    if (activate && (isActiveCombatant || !game.settings.get(MODULE_ID, 'RolodexCombatAutoSelect'))) {
      this.activateTab(sheetId);
    }
  }

  async close(options) {
    Hooks.off('combatTurnChange', this.onCombatTurnChange);
    Hooks.off('deleteCombat', this.onCombatDelete);
    Hooks.off('updateCombat', this.onCombatUpdate);

    await Promise.all([
      super.close(options),
      ...Object.keys(this.sheets).map(async (key) => this.closeManagedSheet(key))
    ]);

    instance = new RolodexApplication();
    return Promise.resolve();
  }

  async closeManagedSheet(id) {
    const app = this.sheets[id].app;

    app.setPosition(this.sheets[id].defaultPosition);
    delete this.sheets[id];

    return app.close({ force: true });
  }

  async onCombatDelete(combat) {
    const el = this.element[0];

    for (const [sheetId, { app }] of Object.entries(this.sheets)) {
      const tab = el.querySelector(`.sheet-navigation a[id^=rolodex-tab][data-tab="${sheetId}"]`);
      if (!tab || !app.actor) continue;

      if (app.actor.id === combat.combatant?.actorId) {
        tab.classList.remove('activeCombatant');
      }
    }
  }

  async onCombatTurnChange(combat, prior, current) {
    const el = this.element[0];

    for (const [sheetId, { app }] of Object.entries(this.sheets)) {
      const tab = el.querySelector(`.sheet-navigation a[id^=rolodex-tab][data-tab="${sheetId}"]`);
      if (!tab || !app.actor) continue;

      tab.classList.remove('activeCombatant');

      for (const token of app.actor.getActiveTokens()) {
        if (token.id === current.tokenId) {
          tab.classList.add('activeCombatant');

          if (game.settings.get(MODULE_ID, 'RolodexCombatAutoSelect')) {
            this.activateTab(sheetId);
          }

          break;
        }
      }
    }
  }

  async onCombatUpdate(combat, { active }) {
    if (!active || !combat.combatant) return;

    return this.onCombatTurnChange(combat, null, combat.combatant);
  }

  async pingActiveToken() {
    if (!canvas.ready || !this.activeSheet) return;

    const appId = this.activeSheet.dataset.appid;
    const app = ui.windows[appId];

    if (!app || !app.actor) return;

    return Promise.all(app.actor.getActiveTokens().map(async (t) => canvas.ping(t.center)));
  }

  async removeSheet(sheet) {
    const appId = sheet.dataset.appid;
    const app = ui.windows[appId];
    const el = this.element[0];

    // noinspection CssInvalidHtmlTagReference
    const tagify = sheet.querySelector('tagify-tags > input');
    if (tagify) {
      // noinspection JSUnresolvedReference
      tagify.__tagify?.destroy();
    }

    document.body.append(sheet);
    app.setPosition(this.sheets[sheet.id].defaultPosition);
    app.render(true);

    const tabNav = el.querySelector(`#rolodex-tab-${sheet.id}`);
    tabNav.removeEventListener('mouseout', this._onTabHoverOut);
    tabNav.removeEventListener('mouseover', this._onTabHoverIn);
    tabNav.remove();

    el.querySelector(`#rolodex-sheet-${sheet.id}`).remove();
    delete this.sheets[sheet.id];

    const managedSheets = Object.keys(this.sheets);

    if (this._tabs[0].active === sheet.id) {
      if (managedSheets.length > 0) {
        this.activateTab(managedSheets.at(0));
      }
    }

    if (managedSheets.length === 0) {
      await this.close({ force: true });
    }
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    const closeBtn = buttons.find((b) => b.class === 'close');

    // override the default class because the built-in listeners are bound with anonymous functions that are not removed on reparenting or re-rendering
    // if this class is not changed, then a sheet that is removed from the rolodex and closed will also trigger close on the rolodex
    if (closeBtn) closeBtn.class = 'rolodex-close';

    return buttons;
  }

  async _renderInner(data, options) {
    const html = await super._renderInner(data, options);

    html[0]
      .querySelector('.sheet-navigation-controls [data-action="maximize"]')
      .addEventListener('click', async () => this.removeSheet(this.activeSheet));
    html[0]
      .querySelector('.sheet-navigation-controls [data-action="ping"]')
      .addEventListener('click', async () => this.pingActiveToken());

    return html;
  }

  _onResize(event) {
    super._onResize(event);

    const el = this.element[0];
    const bounds = el.querySelector('.sheet-container').getBoundingClientRect();

    Object.values(this.sheets).forEach(({ app }) => {
      app.setPosition({ left: 0, top: 0, width: bounds.width, height: bounds.height });
    });
  }

  _onTabHoverIn(event) {
    event.stopPropagation();

    const tab = event.target.dataset.tab;
    if (!tab) return;

    for (const token of this.sheets[tab].app.actor.getActiveTokens()) {
      if (token?.visible) {
        token._onHoverIn(event);
        this._highlights.push(token);
      }
    }
  }

  _onTabHoverOut(event) {
    event.stopPropagation();

    this._highlights.forEach((token) => token?._onHoverOut(event));
    this._highlights = [];
  }
}

export let instance = new RolodexApplication();

Hooks.once('libWrapper.Ready', () => {
  libWrapper.register(
    MODULE_ID,
    'Application.prototype.bringToTop',
    async function () {
      return instance.activate(this);
    },
    'LISTENER'
  );
});

export function registerSettings() {
  game.settings.register(MODULE_ID, 'RolodexEnabled', {
    name: `${MODULE_ID}.rolodex.settings.enabled.title`,
    hint: `${MODULE_ID}.rolodex.settings.enabled.hint`,
    default: false,
    config: true,
    requiresReload: true,
    scope: 'client',
    type: Boolean
  });
  game.settings.register(MODULE_ID, 'RolodexCombatAutoSelect', {
    name: `${MODULE_ID}.rolodex.settings.combatAutoSelect.title`,
    hint: `${MODULE_ID}.rolodex.settings.combatAutoSelect.hint`,
    default: false,
    config: true,
    requiresReload: false,
    scope: 'client',
    type: Boolean
  });

  game.keybindings.register(MODULE_ID, 'OpenRolodex', {
    name: 'Open Rolodex',
    hint: 'Add any selected tokens to the rolodex and open the rolodex window',
    editable: [
      {
        key: 'KeyR',
        modifiers: [KeyboardManager.MODIFIER_KEYS.ALT]
      }
    ],
    onDown: selectAndOpenRolodex,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
}

async function selectAndOpenRolodex() {
  const tokens = canvas.tokens.controlled;

  if (tokens.length === 0) {
    ui.notifications.warn(localize('rolodex.warning.noTokenOnHotkey'));
    return;
  }

  await Promise.all(
    tokens.map(async ({ actor }) => {
      if (!actor.sheet.rendered) return actor.sheet._render(true);
    })
  );

  for (const { actor } of tokens) {
    await instance.addSheet(actor.sheet.element[0], false);
  }

  // delay to allow rendering events to finish
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      instance
        .activate({ id: Array.from(instance.rolodexTabs).at(-1).dataset.tab })
        .then(resolve)
        .catch(reject);
    }, 0);
  });
}

export function setup() {
  if (!game.settings.get(MODULE_ID, 'RolodexEnabled')) return;

  if (!game.modules.get('lib-wrapper')?.active && game.user.isGM) {
    ui.notifications.error(localize('rolodex.warning.libWrapper'));
    return;
  }

  Hooks.on('getActorSheetHeaderButtons', (sheet, buttons) => {
    buttons.splice(-1, 0, {
      class: 'rolodex',
      icon: 'fas fa-folders',
      label: `${MODULE_ID}.rolodex.title`,
      onclick: () => onStartRolodex(sheet)
    });
  });
}

async function onStartRolodex(sheet) {
  const el = sheet.element[0];
  return instance.addSheet(el);
}
