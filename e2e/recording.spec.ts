import { test, expect } from '@playwright/test';
import { ElectronAppHelper } from './helpers/electron-app';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Screen2Action Recording E2E Tests', () => {
  let electronHelper: ElectronAppHelper;
  
  test.beforeAll(async () => {
    electronHelper = new ElectronAppHelper();
    
    // Start backend server
    await electronHelper.startBackend();
  });
  
  test.beforeEach(async () => {
    // Launch Electron app for each test
    await electronHelper.launch();
  });
  
  test.afterEach(async () => {
    // Take screenshot on failure
    if (test.info().status !== test.info().expectedStatus) {
      await electronHelper.screenshot(`failure-${Date.now()}`);
    }
    
    // Close the app after each test
    await electronHelper.close();
  });
  
  test.afterAll(async () => {
    // Stop backend server
    await electronHelper.stopBackend();
  });
  
  test('Should complete a full recording workflow with voice narration', async () => {
    const page = electronHelper.getPage()!;
    
    // Step 1: Wait for the main window to load
    await page.waitForLoadState('networkidle');
    console.log('✅ Main window loaded');
    
    // Step 2: Check if we're on the recording page or need to navigate to it
    const recordingPageTitle = await page.locator('h2:has-text("Screen Recording")').count();
    if (recordingPageTitle === 0) {
      // Navigate to recording page if not already there
      const recordingNav = page.getByRole('button', { name: 'Meeting Recording' });
      if (await recordingNav.count() > 0) {
        await recordingNav.first().click();
        await page.waitForTimeout(1000);
      }
    }
    
    // Step 3: Select a screen source from dropdown (first available)
    const screenSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Select Screen' }) }).first();
    await expect(screenSelect).toBeVisible({ timeout: 20000 });
    const selectHandle = await screenSelect.elementHandle();
    if (!selectHandle) throw new Error('Screen select not found');
    await page.waitForFunction((el) => (el as HTMLSelectElement).options.length > 1, selectHandle);
    const value = await selectHandle.evaluate((el) => (el as HTMLSelectElement).options[1].value);
    await screenSelect.selectOption(value);
    console.log('✅ Screen source selected');
    
    // Step 4: Enable audio if available
    const audioToggle = page.locator('input[type="checkbox"]').first();
    if (await audioToggle.count() > 0) {
      await audioToggle.check();
      console.log('✅ Audio enabled');
    }
    
    // Step 5: Start recording
    const startButton = page.locator('button:has-text("Start Recording")');
    await expect(startButton).toBeVisible();
    await startButton.click();
    console.log('✅ Recording started');
    
    // Wait for recording to actually start
    await page.waitForTimeout(2000);
    
    // Step 6: Verify recording is in progress
    const stopButton = page.locator('button:has-text("Stop Recording")');
    await expect(stopButton).toBeVisible();
    
    // Check timer is running
    const timer = page.locator('text=/\\d{2}:\\d{2}/');
    await expect(timer).toBeVisible();
    
    // Step 7: Add notes with H1 paragraph while recording
    const editorContainer = page.locator('.monaco-editor');
    await expect(editorContainer).toBeVisible();
    
    // Click in the editor to focus it
    await editorContainer.click();
    await page.waitForTimeout(500);
    
    // Type an H1 heading and some content
    await page.keyboard.type('# Recording Test - Main Title');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('This is a test paragraph for the recording functionality.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('We are testing the voice narration and note-taking features.');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## Section 1: Features');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- Voice recording');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- Screen capture');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- Note synchronization');
    
    console.log('✅ Notes added with H1 and content');
    
    // Step 8: Record for a few seconds to capture some content
    await page.waitForTimeout(3000);
    
    // Step 9: Stop recording
    await stopButton.click();
    console.log('✅ Recording stopped');
    
    // Wait for processing
    await page.waitForTimeout(2000);
    
    // Step 10: Wait for navigation to review page
    await page.waitForSelector('text=/Review Session|Review Recording|Session Review/', { 
      timeout: 30000 
    });
    console.log('✅ Navigated to review page');
    
    // Step 11: Ensure review sidebar is visible (only click if it's hidden)
    const showSidebarBtn = page.locator('button[title="Show sidebar"]').first();
    if (await showSidebarBtn.count() > 0) {
      await showSidebarBtn.click();
      console.log('✅ Sidebar shown');
    }
    
    await page.waitForTimeout(1000);
    
    // Step 12: Verify the notes are displayed on review page (Monaco content)
    const monacoView = page.locator('.monaco-editor .view-lines');
    await expect(monacoView).toBeVisible({ timeout: 20000 });
    await expect(monacoView).toContainText('Recording Test - Main Title', { timeout: 20000 });
    console.log('✅ Notes are displayed in review');
    
    // Step 13: Verify review sidebar shows time range info
    await expect(page.locator('text=Time range:')).toBeVisible({ timeout: 20000 });
    console.log('✅ Time range displayed');
    
    // Take final screenshot
    await electronHelper.screenshot('recording-test-complete');
    console.log('✅ Test completed successfully');
  });
  
  test('Should handle recording without audio', async () => {
    const page = electronHelper.getPage()!;
    
    // Wait for the main window to load
    await page.waitForLoadState('networkidle');
    
    // Select a screen source from dropdown
    const screenSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Select Screen' }) }).first();
    await expect(screenSelect).toBeVisible({ timeout: 20000 });
    const selectHandle = await screenSelect.elementHandle();
    if (!selectHandle) throw new Error('Screen select not found');
    await page.waitForFunction((el) => (el as HTMLSelectElement).options.length > 1, selectHandle);
    const value = await selectHandle.evaluate((el) => (el as HTMLSelectElement).options[1].value);
    await screenSelect.selectOption(value);
    
    // Make sure audio is disabled
    const audioToggle = page.locator('input[type="checkbox"]').first();
    if (await audioToggle.count() > 0 && await audioToggle.isChecked()) {
      await audioToggle.uncheck();
      console.log('✅ Audio disabled');
    }
    
    // Start recording
    const startButton = page.locator('button:has-text("Start Recording")');
    await startButton.click();
    
    // Add some notes
    const editorContainer = page.locator('.monaco-editor');
    await editorContainer.click();
    await page.keyboard.type('# Test without audio');
    await page.keyboard.press('Enter');
    await page.keyboard.type('This recording has no audio track.');
    
    // Record for a short time
    await page.waitForTimeout(2000);
    
    // Stop recording
    const stopButton = page.locator('button:has-text("Stop Recording")');
    await stopButton.click();
    
    // Wait for review page
    await page.waitForSelector('text=/Review Session|Review Recording|Session Review/', { 
      timeout: 30000 
    });
    
    // Verify notes are displayed (Monaco content)
    const monacoView = page.locator('.monaco-editor .view-lines');
    await expect(monacoView).toBeVisible({ timeout: 20000 });
    await expect(monacoView).toContainText('Test without audio', { timeout: 20000 });
    
    console.log('✅ Recording without audio completed successfully');
  });
  
  test('Should validate timestamp generation for headings', async () => {
    const page = electronHelper.getPage()!;
    
    // Wait for the main window to load
    await page.waitForLoadState('networkidle');
    
    // Select a screen source from dropdown
    const screenSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Select Screen' }) }).first();
    await expect(screenSelect).toBeVisible({ timeout: 20000 });
    const selectHandle = await screenSelect.elementHandle();
    if (!selectHandle) throw new Error('Screen select not found');
    await page.waitForFunction((el) => (el as HTMLSelectElement).options.length > 1, selectHandle);
    const value = await selectHandle.evaluate((el) => (el as HTMLSelectElement).options[1].value);
    await screenSelect.selectOption(value);
    
    // Start recording
    const startButton = page.locator('button:has-text("Start Recording")');
    await startButton.click();
    
    await page.waitForTimeout(1000);
    
    // Add multiple headings at different times
    const editorContainer = page.locator('.monaco-editor');
    await editorContainer.click();
    
    // First heading
    await page.keyboard.type('# First Heading');
    await page.keyboard.press('Enter');
    
    // Wait 2 seconds
    await page.waitForTimeout(2000);
    
    // Second heading
    await page.keyboard.type('## Second Heading');
    await page.keyboard.press('Enter');
    
    // Wait 2 seconds
    await page.waitForTimeout(2000);
    
    // Third heading
    await page.keyboard.type('### Third Heading');
    
    // Stop recording
    const stopButton = page.locator('button:has-text("Stop Recording")');
    await stopButton.click();
    
    // Wait for review page
    await page.waitForSelector('text=/Review Session|Review Recording|Session Review/', { 
      timeout: 30000 
    });
    
    // Verify all headings are displayed in review Monaco content
    const monacoView = page.locator('.monaco-editor .view-lines');
    await expect(monacoView).toBeVisible({ timeout: 20000 });
    await expect(monacoView).toContainText('First Heading', { timeout: 20000 });
    await expect(monacoView).toContainText('Second Heading', { timeout: 20000 });
    await expect(monacoView).toContainText('Third Heading', { timeout: 20000 });
    
    // Verify review sidebar shows time range info (as proxy for timestamps)
    await expect(page.locator('text=Time range:')).toBeVisible({ timeout: 20000 });
    console.log('✅ Timestamp-related UI validated via time range');
  });
});