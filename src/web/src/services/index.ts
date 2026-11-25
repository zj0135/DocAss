import { BrowserServices } from './BrowserServices';
import { DesktopServices } from './DesktopServices';
import { Webview2Transport } from '../bridge/webview2Transport';
import type { AppServices } from './AppServices';
let current: AppServices | undefined;
export function createServices(): AppServices {
  if (!current) {
    current = window.chrome?.webview ? new DesktopServices(new Webview2Transport(window.chrome.webview)) : new BrowserServices();
    window.addEventListener('pagehide', event => { if (!event.persisted) { current?.dispose(); current = undefined; } }, { once: true });
  }
  return current;
}
