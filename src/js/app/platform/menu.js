/**
 * Platform menu module.
 *
 * Existing call site: src/js/index.jsx, once when the game launches.
 *
 * `addHelpMenuItems(items)` appends `items` to the Help submenu of the
 * application menu, in the given order, and then calls
 * `Menu.setApplicationMenu` (this must stay the last step). When the Help
 * submenu already has an item labelled "Toggle Developer Tools" (the items
 * were added before), nothing is appended, as before; the application menu is
 * still set again. Nothing touches Electron at import time. Electron objects
 * are not exposed: callers pass plain `{ label, click }` descriptions.
 *
 * Failures (no application menu, no Help menu) throw a TypeError from
 * dereferencing, as the previous inline code did; nothing is caught.
 *
 * @typedef {Object} PlatformMenuItem
 * @property {string} label
 * @property {() => (void|Promise<void>)} click
 *
 * @typedef {Object} PlatformMenu
 * @property {(items: PlatformMenuItem[]) => void} addHelpMenuItems
 *   Synchronous. Returns undefined.
 */
import { remote } from 'electron';

// The item whose presence means the items were already added.
const GUARD_LABEL = 'Toggle Developer Tools';

export function addHelpMenuItems(items) {
  const { Menu, MenuItem } = remote;
  const applicationMenu = Menu.getApplicationMenu();
  const helpMenuItem = applicationMenu.items.find(
    menuItem => menuItem.role === 'help'
  );

  const guardItem = helpMenuItem.submenu.items.find(
    item => item.label === GUARD_LABEL
  );

  if (!guardItem) {
    items.forEach(({ label, click }) => {
      helpMenuItem.submenu.append(new MenuItem({ label, click }));
    });
  }

  Menu.setApplicationMenu(applicationMenu);
}
