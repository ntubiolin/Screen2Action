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
      const recordingNav = page.locator('button:has-text("Recording")');
      if (await recordingNav.count() > 0) {
        await recordingNav.click();
        await page.waitForTimeout(1000);
      }
    }
    
    // Step 3: Select a screen source (usually the first one)
    await page.waitForSelector('.screen-item', { timeout: 10000 });
    const screenItems = await page.locator('.screen-item').count();
    expect(screenItems).toBeGreaterThan(0);
    
    // Click the first screen
    await page.locator('.screen-item').first().click();
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
    
    // Step 11: Check if expand button exists and click it
    const expandButton = page.locator('button[aria-label*="expand"], button[title*="expand"], button:has-text("Expand")').first();
    const sidebarToggle = page.locator('button[aria-label*="sidebar"], button[title*="sidebar"]').first();
    
    if (await expandButton.count() > 0) {
      await expandButton.click();
      console.log('✅ Clicked expand button');
    } else if (await sidebarToggle.count() > 0) {
      await sidebarToggle.click();
      console.log('✅ Clicked sidebar toggle');
    }
    
    await page.waitForTimeout(1000);
    
    // Step 12: Verify audio player is present
    const audioPlayer = page.locator('audio, .audio-player, [class*="audio"]').first();
    await expect(audioPlayer).toBeVisible({ timeout: 10000 });
    console.log('✅ Audio player found');
    
    // Step 13: Play the audio
    const playButton = page.locator('button[aria-label*="play"], button[title*="play"], button:has-text("Play")').first();
    
    if (await playButton.count() > 0) {
      await playButton.click();
      console.log('✅ Clicked play button');
    } else {
      // Try to play directly on audio element
      await page.evaluate(() => {
        const audio = document.querySelector('audio') as HTMLAudioElement;
        if (audio) {
          audio.play();
        }
      });
      console.log('✅ Started audio playback via JavaScript');
    }
    
    // Wait a bit to let audio play
    await page.waitForTimeout(2000);
    
    // Step 14: Verify the notes are displayed
    const notesContent = page.locator('text=/Recording Test - Main Title/');
    await expect(notesContent).toBeVisible({ timeout: 10000 });
    console.log('✅ Notes are displayed in review');
    
    // Step 15: Verify timestamps are shown for headings
    const timestamps = page.locator('text=/\\d{2}:\\d{2}/');
    const timestampCount = await timestamps.count();
    expect(timestampCount).toBeGreaterThan(0);
    console.log(`✅ Found ${timestampCount} timestamps`);
    
    // Step 16: Check if audio is actually playing
    const isPlaying = await page.evaluate(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement;
      return audio ? !audio.paused : false;
    });
    
    if (isPlaying) {
      console.log('✅ Audio is playing');
    } else {
      console.log('⚠️ Audio might not be playing (could be due to autoplay restrictions)');
    }
    
    // Step 17: Pause the audio
    const pauseButton = page.locator('button[aria-label*="pause"], button[title*="pause"], button:has-text("Pause")').first();
    
    if (await pauseButton.count() > 0) {
      await pauseButton.click();
      console.log('✅ Audio paused');
    } else {
      await page.evaluate(() => {
        const audio = document.querySelector('audio') as HTMLAudioElement;
        if (audio) {
          audio.pause();
        }
      });
      console.log('✅ Audio paused via JavaScript');
    }
    
    // Take final screenshot
    await electronHelper.screenshot('recording-test-complete');
    console.log('✅ Test completed successfully');
  });
  
  test('Should handle recording without audio', async () => {
    const page = electronHelper.getPage()!;
    
    // Wait for the main window to load
    await page.waitForLoadState('networkidle');
    
    // Select a screen source
    await page.waitForSelector('.screen-item', { timeout: 10000 });
    await page.locator('.screen-item').first().click();
    
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
    
    // Verify notes are displayed
    const notesContent = page.locator('text=/Test without audio/');
    await expect(notesContent).toBeVisible({ timeout: 10000 });
    
    console.log('✅ Recording without audio completed successfully');
  });
  
  test('Should validate timestamp generation for headings', async () => {
    const page = electronHelper.getPage()!;
    
    // Wait for the main window to load
    await page.waitForLoadState('networkidle');
    
    // Select a screen source
    await page.waitForSelector('.screen-item', { timeout: 10000 });
    await page.locator('.screen-item').first().click();
    
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
    
    // Verify all headings are displayed with timestamps
    await expect(page.locator('text=/First Heading/')).toBeVisible();
    await expect(page.locator('text=/Second Heading/')).toBeVisible();
    await expect(page.locator('text=/Third Heading/')).toBeVisible();
    
    // Verify timestamps exist
    const timestamps = await page.locator('.s2a-ts-chip, [class*="timestamp"]').all();
    expect(timestamps.length).toBeGreaterThanOrEqual(3);
    
    console.log('✅ Timestamp validation completed successfully');
  });
});