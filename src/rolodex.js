import { MODULE_ID } from './index';

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

    this.defaultPositions = {};
  }

  get managedSheets() {
    const el = this.element[0];
    return Array.from(el.querySelectorAll('.rolodex-sheet .window-app'));
  }

  async addSheet(sheet) {
    if (!this.rendered) await this._render(true);

    const el = this.element[0];
    const appId = sheet.dataset.appid;
    const app = ui.windows[appId];

    // for sheets that use the Tagify library, destroy the handler (it will be recreated on re-render)
    // noinspection CssInvalidHtmlTagReference
    const tagify = sheet.querySelector('tagify-tags > input');
    if (tagify) {
      // noinspection JSUnresolvedReference
      tagify.__tagify?.destroy();
    }

    this.defaultPositions[appId] = { ...app.position };

    const sheetId = sheet.id;

    // create tab navigation items
    const tabNav = document.createElement('a');
    tabNav.id = `rolodex-tab-${sheetId}`;
    tabNav.dataset.tab = sheetId;
    tabNav.append(app.actor.name);

    const popout = document.createElement('i');
    popout.setAttribute('class', 'fa fa-maximize');
    popout.addEventListener('click', () => this.removeSheet(sheet));
    tabNav.append(popout);

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

    this.activateTab(sheetId);
  }

  async close(options) {
    await Promise.all([
      super.close(options),
      ...this.managedSheets.map(async (ms) => this.closeManagedSheet(ms.dataset.appid))
    ]);

    instance = new RolodexApplication();
    return Promise.resolve();
  }

  async closeManagedSheet(appId) {
    const app = ui.windows[appId];
    app.setPosition(this.defaultPositions[appId]);

    return app.close({ force: true });
  }

  removeSheet(sheet) {
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
    app.setPosition(this.defaultPositions[appId]);
    app.render(true);

    el.querySelector(`#rolodex-tab-${sheet.id}`).remove();
    el.querySelector(`#rolodex-sheet-${sheet.id}`).remove();
    delete this.defaultPositions[appId];

    if (this._tabs[0].active === sheet.id) {
      const otherSheets = this.managedSheets;

      if (otherSheets.length > 0) {
        this.activateTab(otherSheets[0].id);
      }
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

  _onResize(event) {
    super._onResize(event);

    const el = this.element[0];
    const bounds = el.querySelector('.sheet-container').getBoundingClientRect();

    this.managedSheets.forEach((ms) => {
      const app = ui.windows[ms.dataset.appid];
      app.setPosition({ left: 0, top: 0, width: bounds.width, height: bounds.height });
    });
  }
}

export let instance = new RolodexApplication();

export function registerSettings() {
  game.settings.register(MODULE_ID, 'RolodexEnabled', {
    name: `${MODULE_ID}.rolodex.enabled`,
    hint: `${MODULE_ID}.rolodex.hint`,
    default: false,
    config: true,
    requiresReload: true,
    scope: 'client',
    type: Boolean
  });
}

export function setup() {
  if (!game.settings.get(MODULE_ID, 'RolodexEnabled')) return;

  Hooks.on('getActorSheetHeaderButtons', (sheet, buttons) => {
    buttons.splice(-1, 0, {
      class: 'rolodex',
      icon: 'fas fa-folders',
      label: `${MODULE_ID}.rolodex.title`,
      onclick: () => onStartRolodex(sheet)
    });
  });

  instance.render(true);
}

async function onStartRolodex(sheet) {
  const el = sheet.element[0];

  return instance.addSheet(el);
}
