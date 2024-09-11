import { localize, MODULE_ID } from './index';

export function registerSettings() {
  game.settings.register(MODULE_ID, 'TabLinkEnabled', {
    name: `${MODULE_ID}.tablink.enabled`,
    hint: `${MODULE_ID}.tablink.hint`,
    default: true,
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
      icon: 'fas fa-crosshairs-simple',
      label: `${MODULE_ID}.tablink.title`,
      onclick: () => onStartTablink(sheet)
    });
  });

  Hooks.on('controlToken', async (token, controlled) => {
    if (controlled && state.status === 'waiting') {
      await onTargetSelect(token);
    }
  });
}

const state = {
  status: 'ready'
};

async function onStartTablink(source) {
  state.observer?.disconnect();
  state.source = source;
  state.status = 'waiting';

  await source.minimize();
  document.addEventListener('click', onTargetSelect);
  ui.notifications.info(localize('tablink.prompt.select', { sheetType: source.constructor.name }));
}

async function onTargetSelect(event) {
  document.removeEventListener('click', onTargetSelect);

  if (!state.source || state.status !== 'waiting') return;

  state.status = 'ready';
  await state.source.maximize();

  const targetSheet = await findParentSheet(event);
  if (!targetSheet) return;

  if (state.source.constructor.name !== targetSheet.constructor.name) {
    ui.notifications.warn(localize('tablink.warning.incompatibleTypes'));
    return;
  }

  if (!targetSheet.rendered) {
    ui.notifications.warn(localize('tablink.warning.notRendered'));
    return;
  }

  const observer = new MutationObserver(onMutation);
  setupObserver(observer, state.source);
  setupObserver(observer, targetSheet);

  state.observer = observer;
  state.target = targetSheet;
}

function setupObserver(observer, sheet) {
  const tabs = sheet.element[0].querySelector(sheet.options.tabs[0].navSelector);

  tabs.querySelectorAll('a.item').forEach((el) => {
    observer.observe(el, {
      attributeFilter: ['class'],
      attributes: true
    });
  });
}

function onMutation(records) {
  records.forEach(({ target }) => {
    if (target.classList.contains('active')) {
      // wrapped in try/catch because the core code throws an error if the tab names do not match
      try {
        state.source.activateTab(target.dataset['tab']);
      } catch {}
      try {
        state.target.activateTab(target.dataset['tab']);
      } catch {}
    }
  });
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
