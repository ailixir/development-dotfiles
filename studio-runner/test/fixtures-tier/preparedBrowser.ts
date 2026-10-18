import {playwrightBrowserFactory as realBrowserFactory} from '../../src/run/browser.js';
import {prepareBrowserProfile} from '../../src/run/scratchLayout.js';
import type {BrowserFactory} from '../../src/run/browserFactory.js';
/** Real Chromium fixture setup mirrors the production child profile preparation. */
export const playwrightBrowserFactory: BrowserFactory = {
  launch(request) { prepareBrowserProfile(request.scratchPath); return realBrowserFactory.launch(request); },
};
