import { test, expect } from '@playwright/test';
import { ElectronAppHelper } from './helpers/electron-app';

test.describe('Screen2Action Floating Recording E2E', () => {
  let electronHelper: ElectronAppHelper;

  test.beforeAll(async () => {
    electronHelper = new ElectronAppHelper();
    // Enable floating-only mode so only the floating window is created
    electronHelper.setExtraEnv({ S2A_E2E_FLOATING_ONLY: '1' });
    await electronHelper.startBackend();
  });

  test.beforeEach(async () => {
    await electronHelper.launch();
  });

  test.afterEach(async () => {
    if (test.info().status !== test.info().expectedStatus) {
      await electronHelper.screenshot(`failure-${Date.now()}`);
    }
    await electronHelper.close();
  });

  test.afterAll(async () => {
    await electronHelper.stopBackend();
  });

  test('Should record in Floating Mode and expand to review', async () => {
    const page = electronHelper.getPage()!;
    const app = electronHelper.getApp()!;

    // In floating-only mode, the first window is already the floating page
    const floatingPage = page;

    // Wait for floating window to load
    await floatingPage.waitForLoadState('domcontentloaded');
    await expect(floatingPage.locator('.floating-window')).toBeVisible({ timeout: 20000 });

    // Start recording from floating window
    const startBtn = floatingPage.locator('button:has-text("Start")');
    await expect(startBtn).toBeVisible({ timeout: 20000 });
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();

    // Type some notes (including a heading)
    const editor = floatingPage.locator('.monaco-editor');
    await expect(editor).toBeVisible({ timeout: 20000 });
    await editor.click();
    await floatingPage.keyboard.type('# Floating Recording Test');
    await floatingPage.keyboard.press('Enter');
    await floatingPage.keyboard.type('This is entered from the floating window.');

    // Let it record briefly
    await floatingPage.waitForTimeout(2000);

    // Stop recording
    const stopBtn = floatingPage.locator('button:has-text("Stop")');
    await expect(stopBtn).toBeVisible({ timeout: 20000 });
    await stopBtn.click();

    // Click Expand to return to main window review
    const expandBtn = floatingPage.locator('button:has-text("Expand")');
    await expect(expandBtn).toBeVisible({ timeout: 20000 });
    const mainWindowPromise = app.waitForEvent('window');
    await expandBtn.click();
    const mainPage = await mainWindowPromise;
    await mainPage.waitForLoadState('domcontentloaded');

    // Verify main window shows review page
    await mainPage.waitForSelector('text=/Review Session|Review Recording|Session Review/', { timeout: 30000 });

    // Verify notes content contains our heading
    const monacoView = mainPage.locator('.monaco-editor .view-lines');
    await expect(monacoView).toBeVisible({ timeout: 20000 });
    await expect(monacoView).toContainText('Floating Recording Test', { timeout: 20000 });
  });
});


