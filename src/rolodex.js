import { localize, MODULE_ID } from './index';

class RolodexApplication extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: 'rolodex',
    position: {
      height: 600,
      width: 800
    },
    window: {
      resizable: true
    }
  };

  static PARTS = {
    tabs: {
      template: 'modules/sheet-link/static/templates/rolodex-tab-bar.hbs'
    },
    container: {
      template: 'modules/sheet-link/static/templates/rolodex-sheet-container.hbs'
    }
  };

  static TAB_GROUP = 'rolodex';
  static TABS = {
    [RolodexApplication.TAB_GROUP]: {
      tabs: []
    }
  };

  constructor() {
    super();

    this._highlights = [];
    this._hooks = {};
    this.sheets = {};

    this._hooks['combatTurnChange'] = Hooks.on('combatTurnChange', this.onCombatTurnChange.bind(this));
    this._hooks['deleteCombat'] = Hooks.on('deleteCombat', this.onCombatDelete.bind(this));
    this._hooks['updateActor'] = Hooks.on('updateActor', this.onActorUpdate.bind(this));
    this._hooks['updateCombat'] = Hooks.on('updateCombat', this.onCombatUpdate.bind(this));
    this._hooks['updateCombatant'] = Hooks.on('updateCombatant', this.onCombatantUpdated.bind(this));
  }

  get activeSheet() {
    const el = this.element;
    return el?.querySelector('.rolodex-sheet.active > .window-app');
  }

  get rolodexTabs() {
    const el = this.element;
    return el?.querySelectorAll('[id^=rolodex-tab-]');
  }

  get title() {
    return localize('rolodex.title');
  }

  async activate(sheet) {
    if (!this.sheets[sheet.id]) return;

    await this.maximize();
    this.bringToFront();
    this.changeTab(sheet.id, RolodexApplication.TAB_GROUP);
  }

  async addSheet(sheet, activate = true) {
    if (!this.rendered) await this.render(true);

    const appId = sheet.dataset.appid;
    const app = ui.windows[appId];
    const el = this.element;
    const isActiveCombatant = game.combat?.combatant?.actorId === app.actor.id;
    const sheetId = sheet.id;

    if (this.sheets[sheetId]) {
      return this.activate(sheet);
    }

    this.sheets[sheetId] = { app, appId, defaultPosition: { ...app.position }, sheet };

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
    tabNav.dataset.action = 'tab';
    tabNav.dataset.group = RolodexApplication.TAB_GROUP;
    tabNav.dataset.tab = sheetId;
    tabNav.title = app.actor.name;
    tabNav.append(app.actor.name);
    tabNav.addEventListener('mouseout', this._onTabHoverOut.bind(this));
    tabNav.addEventListener('mouseover', this._onTabHoverIn.bind(this));
    tabNav.addEventListener('dblclick', this._onTabDblClick.bind(this));

    if (isActiveCombatant) {
      tabNav.classList.add('activeCombatant');
    }

    el.querySelector('.sheet-navigation').append(tabNav);

    // create tab content
    const tab = document.createElement('div');
    tab.id = `rolodex-sheet-${sheetId}`;
    tab.dataset.group = RolodexApplication.TAB_GROUP;
    tab.dataset.tab = sheetId;
    tab.setAttribute('class', 'tab rolodex-sheet');
    tab.append(sheet);

    const resizeHandle = el.querySelector('.window-resize-handle');
    resizeHandle.style.zIndex = Math.max(resizeHandle.style.zIndex, app.position.zIndex + 1);

    el.querySelector('.sheet-container').append(tab);

    // adjust size to fit container
    const bounds = el.querySelector('.sheet-container').getBoundingClientRect();
    app.setPosition({ left: 0, top: 0, width: bounds.width, height: bounds.height });
    app.render(true);

    if (activate && (isActiveCombatant || !game.settings.get(MODULE_ID, 'RolodexCombatSync'))) {
      this.changeTab(sheetId, RolodexApplication.TAB_GROUP);
    }
  }

  changeTab(tab, group, { event, navElement, force = false, updatePosition = true } = {}) {
    super.changeTab(tab, group, { event, navElement, force, updatePosition });

    navElement ||= this.element.querySelector('.sheet-navigation');
    const activeTab = navElement.querySelector('.active');

    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth' });
    }
  }

  async close(options) {
    for (const [hook, fn] of Object.entries(this._hooks)) {
      Hooks.off(hook, fn);
    }

    this._hooks = {};

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

  async onActorUpdate(actor, { system }, changes) {
    if (!game.settings.get(MODULE_ID, 'RolodexCombatRemoveOnDeath')) return;
    if (!game.combat || !game.combat.active || !game.combat.turns.find((c) => c.actorId === actor.id)) return;

    if (changes.damageTaken > 0 && system?.attributes?.hp?.value === 0) {
      for (const { app, sheet } of Object.values(this.sheets)) {
        if (actor.id === app.actor.id) {
          await this.removeSheet(sheet, false);
        }
      }
    }
  }

  async onCombatDelete(combat) {
    const el = this.element;

    for (const [sheetId, { app }] of Object.entries(this.sheets)) {
      const tab = el.querySelector(`.sheet-navigation a[id^=rolodex-tab][data-tab="${sheetId}"]`);
      if (!tab || !app.actor) continue;

      if (app.actor.id === combat.combatant?.actorId) {
        tab.classList.remove('activeCombatant');
      }
    }
  }

  async onCombatantUpdated() {
    if (game.settings.get(MODULE_ID, 'RolodexCombatSync')) {
      setTimeout(() => this.sortByTurnOrder(game.combat), 0);
    }
  }

  async onCombatTurnChange(combat, prior, current) {
    const el = this.element;

    for (const [sheetId, { app }] of Object.entries(this.sheets)) {
      const tab = el.querySelector(`.sheet-navigation a[id^=rolodex-tab][data-tab="${sheetId}"]`);
      if (!tab || !app.actor) continue;

      tab.classList.remove('activeCombatant');

      for (const token of app.actor.getActiveTokens()) {
        if (token.id === current.tokenId) {
          tab.classList.add('activeCombatant');

          if (game.settings.get(MODULE_ID, 'RolodexCombatSync')) {
            this.changeTab(sheetId, RolodexApplication.TAB_GROUP);
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

  async removeSheet(sheet, appendToDOM = true) {
    if (!this.sheets[sheet.id]) return;

    const activeTab = this._getActiveTabId();
    const appId = sheet.dataset.appid;
    const app = ui.windows[appId];
    const el = this.element;

    // noinspection CssInvalidHtmlTagReference
    const tagify = sheet.querySelector('tagify-tags > input');
    if (tagify) {
      // noinspection JSUnresolvedReference
      tagify.__tagify?.destroy();
    }

    if (appendToDOM) {
      document.body.append(sheet);
      app.setPosition(this.sheets[sheet.id].defaultPosition);
      await app.render(true);
    } else {
      setTimeout(() => app.close({ animate: false, force: true }), 0);
    }

    const tabNav = el.querySelector(`#rolodex-tab-${sheet.id}`);
    tabNav.removeEventListener('mouseout', this._onTabHoverOut);
    tabNav.removeEventListener('mouseover', this._onTabHoverIn);
    tabNav.remove();

    el.querySelector(`#rolodex-sheet-${sheet.id}`).remove();
    delete this.sheets[sheet.id];

    const managedSheets = Object.keys(this.sheets);

    if (activeTab === sheet.id) {
      if (managedSheets.length > 0) {
        this.changeTab(managedSheets.at(0), RolodexApplication.TAB_GROUP);
      }
    }

    if (managedSheets.length === 0) {
      await this.close({ force: true });
    }
  }

  sortByTurnOrder(combat) {
    if (!combat || !combat.active) return;

    const el = this.element;
    const order = combat.turns.map((c) => c.actorId);

    for (let i = 0; i < order.length; i++) {
      for (const [sheetId, { app }] of Object.entries(this.sheets)) {
        const tab = el.querySelector(`.sheet-navigation a[id^=rolodex-tab][data-tab="${sheetId}"]`);
        if (!tab || !app.actor) continue;

        if (app.actor.id === order[i]) {
          tab.parentElement.appendChild(tab);
          break;
        }
      }
    }
  }

  _getActiveTabId() {
    for (const tab of this.element.querySelectorAll(`.tabs [data-group="${RolodexApplication.TAB_GROUP}"]`)) {
      if (tab.classList.contains('active')) {
        return tab.dataset.tab;
      }
    }

    return null;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this.element
      .querySelector('.sheet-navigation-controls [data-action="maximize"]')
      .addEventListener('click', async () => this.removeSheet(this.activeSheet));
    this.element
      .querySelector('.sheet-navigation-controls [data-action="ping"]')
      .addEventListener('click', async () => this.pingActiveToken());
  }

  setPosition(position) {
    const appliedPosition = super.setPosition(position);

    const el = this.element;
    const bounds = el.querySelector('.sheet-container').getBoundingClientRect();

    Object.values(this.sheets).forEach(({ app }) => {
      app.setPosition({ left: 0, top: 0, width: bounds.width, height: bounds.height });
    });

    return appliedPosition;
  }

  async _onTabDblClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const tab = event.target.dataset.tab;
    if (!tab) return Promise.resolve();

    const token = this.sheets[tab].app.actor.getActiveTokens().at(0);
    if (!token) return Promise.resolve();

    token.control({ releaseOthers: true });
    return canvas.animatePan({ ...token.center, duration: 500 });
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
  libWrapper.register(
    MODULE_ID,
    'Application.prototype.close',
    async function () {
      return instance.removeSheet(this.element[0], false);
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
  game.settings.register(MODULE_ID, 'RolodexCombatSync', {
    name: `${MODULE_ID}.rolodex.settings.syncWithCombat.title`,
    hint: `${MODULE_ID}.rolodex.settings.syncWithCombat.hint`,
    default: false,
    config: true,
    requiresReload: false,
    scope: 'client',
    type: Boolean
  });
  game.settings.register(MODULE_ID, 'RolodexCombatOpenOnStart', {
    name: `${MODULE_ID}.rolodex.settings.openOnCombat.title`,
    hint: `${MODULE_ID}.rolodex.settings.openOnCombat.hint`,
    default: false,
    config: true,
    requiresReload: false,
    scope: 'client',
    type: Boolean
  });
  game.settings.register(MODULE_ID, 'RolodexCombatRemoveOnDeath', {
    name: `${MODULE_ID}.rolodex.settings.removeOnDeath.title`,
    hint: `${MODULE_ID}.rolodex.settings.removeOnDeath.hint`,
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
    onDown: async () => {
      const tokens = canvas.tokens.controlled;

      if (tokens.length === 0) {
        ui.notifications.warn(localize('rolodex.warning.noTokenOnHotkey'));
        return;
      }

      return selectAndOpenRolodex(tokens.map(({ actor }) => actor));
    },
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
}

async function selectAndOpenRolodex(actors) {
  for (const actor of actors) {
    if (!actor.sheet.rendered) {
      await actor.sheet._render(true);
    }

    await instance.addSheet(actor.sheet.element[0], false);
  }
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
  Hooks.on('combatStart', onCombatStart);
}

async function onCombatStart(combat) {
  if (game.settings.get(MODULE_ID, 'RolodexCombatOpenOnStart')) {
    const npcActors = [];

    for (const combatant of combat.turns) {
      if (combatant.isNPC) {
        npcActors.push(combatant.actor);
      }
    }

    if (npcActors.length > 0) {
      return selectAndOpenRolodex(npcActors);
    }
  }
}

async function onStartRolodex(sheet) {
  const el = sheet.element[0];
  return instance.addSheet(el);
}
