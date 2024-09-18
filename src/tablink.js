import { localize, MODULE_ID } from './index';

class Tablink {
  static STATUS = {
    Ready: 'ready',
    Waiting: 'waiting'
  };

  constructor() {
    this.activeTab = '';
    this.apps = [];
    this.observer = new MutationObserver(this.onMutation.bind(this));
    this.status = Tablink.STATUS.Ready;
    this.unrenderedApps = []; // holds managed sheets that have yet to be opened

    Hooks.on('renderActorSheet', this.onRenderActorSheet.bind(this));
  }

  addLink(app) {
    if (this.apps.includes(app)) return;

    if (!app.element[0]) {
      this.unrenderedApps.push(app);
      return;
    }

    if (!this.activeTab) {
      const tabs = app.element[0].querySelector(app.options.tabs[0].navSelector);

      for (const el of tabs.querySelectorAll('a.item')) {
        if (el.classList.contains('active')) {
          this.activeTab = el.dataset.tab;
          break;
        }
      }
    } else {
      try {
        app.activateTab(this.activeTab);
      } catch {}
    }

    if (this.apps.length > 0) {
      ui.notifications.info(
        localize('tablink.linkActivated', {
          sheetName: app.actor.name,
          otherSheetNames: this.apps.reduce((v, c) => v.concat(c.actor.name), []).join(', ')
        })
      );
    }

    if (!this.apps.every((a) => a.constructor.name === app.constructor.name)) {
      ui.notifications.warn(localize('tablink.warning.dissimilarTypes'));
    }

    this.apps.push(app);
    this.resetObserver();
  }

  isManagingApp(app) {
    return this.apps.some((a) => a.id === app.id);
  }

  async maximize() {
    await Promise.all(this.apps.map(async (app) => app.maximize()));
  }

  async minimize() {
    await Promise.all(this.apps.map(async (app) => app.minimize()));
  }

  onMutation(records) {
    for (const { target } of records) {
      if (target.classList.contains('active')) {
        const activeTab = target.dataset.tab;

        this.apps.forEach((app) => {
          if (app._tabs.some((t) => !!t._nav.querySelector(`[data-tab="${activeTab}"]`))) {
            try {
              app.activateTab(target.dataset.tab);
            } catch {
              // ignore
            }
          }
        });
      }
    }
  }

  onRenderActorSheet(app) {
    if (this.unrenderedApps.includes(app)) {
      this.addLink(app);
      this.unrenderedApps.splice(this.unrenderedApps.indexOf(app), 1);
    } else if (this.apps.includes(app)) {
      this.resetObserver();
    }
  }

  removeLink(app) {
    app.element[0].querySelector('header .header-button.tablink')?.classList.remove('active');

    this.apps.splice(this.apps.indexOf(app), 1);

    if (this.apps.length === 1) {
      this.removeLink(this.apps[0]);
    } else {
      this.resetObserver();
    }
  }

  resetObserver() {
    this.observer.disconnect();

    for (const app of this.apps) {
      if (!app.element[0]) continue;

      app.element[0].querySelector('header .header-button.tablink')?.classList.add('active');

      const tabs = app.element[0].querySelector(app.options.tabs[0].navSelector);
      for (const el of tabs.querySelectorAll('a.item')) {
        this.observer.observe(el, {
          attributeFilter: ['class'],
          attributes: true
        });
      }
    }
  }
}

const tablinks = [];

export function registerSettings() {
  game.settings.register(MODULE_ID, 'TabLinkEnabled', {
    name: `${MODULE_ID}.tablink.enabled`,
    hint: `${MODULE_ID}.tablink.hint`,
    default: false,
    config: true,
    requiresReload: true,
    scope: 'client',
    type: Boolean
  });
}

export function setup() {
  if (!game.settings.get(MODULE_ID, 'TabLinkEnabled')) return;

  Hooks.on('getActorSheetHeaderButtons', (sheet, buttons) => {
    buttons.splice(-1, 0, {
      class: 'tablink',
      icon: 'fas fa-link',
      label: `${MODULE_ID}.tablink.title`,
      onclick: (e) => onStartTablink(e, sheet)
    });
  });

  Hooks.on('controlToken', async (token, controlled) => {
    if (controlled) {
      await onTargetSelect(token);
    }
  });
}

async function onStartTablink(event, source) {
  let tablink = tablinks.find((tl) => tl.isManagingApp(source));

  if (tablink && event.ctrlKey) {
    tablink.removeLink(source);
    ui.notifications.info(localize('tablink.linkDeactivated', { sheetName: source.actor?.name ?? source.id }));
    return;
  } else if (!tablink) {
    tablink = new Tablink();
    tablinks.push(tablink);
  }

  tablink.status = Tablink.STATUS.Waiting;
  await tablink.addLink(source);
  await tablink.minimize();

  document.addEventListener('click', onTargetSelect);
  ui.notifications.info(localize('tablink.prompt.select', { sheetType: source.constructor.name }));
}

async function onTargetSelect(event) {
  document.removeEventListener('click', onTargetSelect);

  const tablink = tablinks.find((tl) => tl.status === Tablink.STATUS.Waiting);
  if (!tablink) return;

  tablink.status = Tablink.STATUS.Ready;
  await tablink.maximize();

  const targetSheet = await findParentSheet(event);

  if (!targetSheet) {
    ui.notifications.warn(localize('tablink.warning.noTarget'));
  } else {
    tablink.addLink(targetSheet);
  }
}

async function findParentSheet({ document, target }) {
  if (document) return document.actor?.sheet;
  else if (target instanceof Element) return findParentSheetFromHTML(target);
}

async function findParentSheetFromHTML(el) {
  if (!el) return null;

  const sheetEl = el.closest('div.app.sheet.actor');
  if (!sheetEl) return null;

  return ui.windows[sheetEl.dataset.appid];
}
