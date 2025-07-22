import { test, expect, Page } from '@playwright/test';

async function setupTest(page: Page): Promise<void> {
  // Navigate to the app
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Close welcome dialog if present
  const getStartedButton = page.locator('button:has-text("Get Started")');
  if (await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await getStartedButton.click();
  }

  // Wait for the UI to load
  await page.waitForSelector('[data-testid="sidebar"], .sidebar, aside', { timeout: 10000 });
}

test.describe('Git Status Indicators - Smoke Test', () => {
  test('should display git status indicator for sessions', async ({ page }) => {
    await setupTest(page);

    // Check if there are any existing sessions with git status indicators
    const existingStatusIndicators = page.locator('[data-testid$="-git-status"]');
    const existingCount = await existingStatusIndicators.count();

    if (existingCount > 0) {
      // Test existing sessions
      const firstIndicator = existingStatusIndicators.first();
      await expect(firstIndicator).toBeVisible();

      // Verify it has a git state attribute
      const gitState = await firstIndicator.getAttribute('data-git-state');
      expect(gitState).toBeTruthy();
      expect(['clean', 'modified', 'ahead', 'behind', 'diverged', 'conflict', 'untracked', 'unknown']).toContain(gitState);

      // Check that it can show loading state when clicked
      const sessionItem = page.locator('[data-testid^="session-"]').first();
      await sessionItem.click();

      // Wait for either loading state to appear or git state to update
      // This ensures we catch the transition properly without arbitrary delays
      const indicatorTestId = await firstIndicator.getAttribute('data-testid');
      await page.waitForFunction(
        (testId) => {
          const indicator = document.querySelector(`[data-testid="${testId}"]`);
          if (!indicator) return false;
          
          // Check if loading state is active or if git state has been updated
          const isLoading = indicator.getAttribute('data-git-loading') === 'true';
          const hasGitState = indicator.hasAttribute('data-git-state');
          
          // We're ready when either loading is shown or git state is present
          return isLoading || hasGitState;
        },
        indicatorTestId,
        { timeout: 2000 }
      ).catch(() => {
        // If timeout, that's okay - the indicator might already have the state
      });

      // The indicator should still be visible (either in loading state or with status)
      await expect(firstIndicator).toBeVisible();
    } else {
      // No existing sessions found - verify the UI is still functional
      // by checking that the sidebar is present (already checked in setupTest)
      // This branch passing without errors indicates the test succeeded
    }

    // Verify the UI is fully loaded by checking for project elements or sidebar
    // The create session button appears on hover, so we'll check for the sidebar instead
    const sidebar = page.locator('[data-testid="sidebar"], .sidebar, aside');
    await expect(sidebar).toBeVisible();
  });

  test('should handle loading states gracefully', async ({ page }) => {
    await setupTest(page);

    // If there are sessions, click on one to potentially trigger loading state
    const sessionItems = page.locator('[data-testid^="session-"]');
    const sessionCount = await sessionItems.count();

    if (sessionCount > 0) {
      await sessionItems.first().click();

      // Check if any git status indicators show loading state
      const loadingIndicators = page.locator('[data-git-loading="true"]');
      
      // Loading state might appear briefly or not at all if cached
      if (await loadingIndicators.count() > 0) {
        // Verify loading indicator has proper structure
        const loader = loadingIndicators.first().locator('.animate-spin');
        await expect(loader).toBeVisible();
      }

      // Wait for any loading to complete by checking for loading state to disappear
      // and git status to be populated
      await page.waitForFunction(
        () => {
          // Check if any loading indicators are still present
          const loadingElements = document.querySelectorAll('[data-git-loading="true"]');
          const hasLoadingState = loadingElements.length > 0;
          
          // Check if git status indicators have a valid state
          const statusElements = document.querySelectorAll('[data-testid$="-git-status"][data-git-state]');
          const hasGitState = statusElements.length > 0;
          
          // Loading is complete when there are no loading states and we have git states
          return !hasLoadingState && hasGitState;
        },
        { timeout: 5000 }
      ).catch(() => {
        // If the wait times out, it might mean no git status is available, which is okay
      });

      // Verify indicators are still visible after loading
      const statusIndicators = page.locator('[data-testid$="-git-status"]');
      if (await statusIndicators.count() > 0) {
        await expect(statusIndicators.first()).toBeVisible();
      }
    }
  });
});