/**
 * Rating Slip Lifecycle E2E Tests
 *
 * Comprehensive test suite covering the complete rating slip lifecycle
 * for the pit dashboard functionality.
 *
 * Test Coverage:
 * - Start Rating Slip: 4 tests
 * - Pause/Resume: 3 tests
 * - Close Rating Slip: 3 tests
 * - Move Player: 3 tests
 * - Complete Workflow: 1 test
 * - Performance Tests: 2 tests
 *
 * Total: 16 tests
 *
 * Prerequisites:
 * - Dev server running at localhost:3000
 * - Test data seeded (players, tables, casinos)
 * - User authenticated or DEV_AUTH_BYPASS enabled
 *
 * Note: This test uses CSS selectors and text queries since data-testid
 * attributes are not yet implemented in pit dashboard components.
 * TODO: Add data-testid attributes to components for more robust selectors
 *
 * @see PRD-002 Rating Slip Service
 * @see PRD-006 Pit Dashboard UI
 * @see ISSUE-8C0E80C2 Missing Cypress rating slip tests
 */

describe('Rating Slip Lifecycle E2E', () => {
  const baseUrl = 'http://localhost:3000';
  const pitDashboardUrl = `${baseUrl}/pit`;

  // Test data utilities
  const generateTestPlayer = () => ({
    firstName: `Test`,
    lastName: `Player${Date.now()}`,
    searchQuery: 'Test',
  });

  beforeEach(() => {
    // Navigate to pit dashboard before each test
    cy.visit(pitDashboardUrl);
    // Wait for dashboard to be fully loaded - look for main layout elements
    // Note: Using Resizable panels as indicator that dashboard loaded
    cy.get('[data-panel-group]', { timeout: 15000 }).should('exist');
  });

  /**
   * START RATING SLIP TESTS (4 tests)
   * Uses Tables Panel to select tables and create new rating slips
   */
  describe('Start Rating Slip', () => {
    it('should display tables in the pit dashboard', () => {
      // Verify Tables tab content is visible (default panel)
      cy.contains('Tables').should('be.visible');
      // Look for table cards in the Tables panel
      cy.get('.grid').find('button, [role="button"]').should('have.length.greaterThan', 0);
    });

    it('should open new slip modal when clicking New Slip button', () => {
      // Click New Slip button in the dashboard
      cy.contains('button', 'New Slip').click();

      // Verify new slip modal opens
      cy.get('[role="dialog"]').should('be.visible');
      cy.contains('New Rating Slip').should('be.visible');
    });

    it('should search for a player in the new slip modal', () => {
      // Open new slip modal
      cy.contains('button', 'New Slip').click();

      // Wait for modal
      cy.get('[role="dialog"]').should('be.visible');

      // Search for a player
      cy.get('[role="dialog"]').within(() => {
        cy.get('input[placeholder*="Search"], input[type="search"]').type('Test');
      });

      // Wait for search results (player cards or list items)
      cy.get('[role="dialog"]').within(() => {
        cy.get('[role="listbox"], [role="option"], .player-result', { timeout: 5000 })
          .should('exist');
      });
    });

    it('should create a new rating slip successfully', () => {
      // Open new slip modal
      cy.contains('button', 'New Slip').click();
      cy.get('[role="dialog"]').should('be.visible');

      // Search and select a player
      cy.get('[role="dialog"]').within(() => {
        cy.get('input[placeholder*="Search"], input[type="search"]').type('Test');
      });

      // Wait for and click a player result
      cy.get('[role="dialog"]').find('[role="option"], .cursor-pointer').first().click();

      // Select a seat (numbered buttons 1-7)
      cy.get('[role="dialog"]').within(() => {
        cy.get('button').filter(':contains("1"), :contains("2"), :contains("3")')
          .not('[disabled]')
          .first()
          .click();
      });

      // Submit the form
      cy.get('[role="dialog"]').within(() => {
        cy.contains('button', 'Start').click();
      });

      // Verify success - toast message appears
      cy.contains('started', { timeout: 10000 }).should('be.visible');
    });
  });

  /**
   * PAUSE/RESUME RATING SLIP TESTS (3 tests)
   * Uses Activity Panel to manage active rating slips
   */
  describe('Pause and Resume Rating Slip', () => {
    beforeEach(() => {
      // Switch to Activity panel to see active slips
      cy.contains('button', 'Activity').click();
      // Wait for active slips to load
      cy.wait(1000);
    });

    it('should display pause button for active rating slips', () => {
      // Find an active slip card with pause button (Pause icon)
      cy.get('[aria-label*="Pause"], button:has(svg)').should('exist');
    });

    it('should pause an active rating slip', () => {
      // Find and click pause button (using aria-label or icon)
      cy.get('[aria-label*="Pause"]').first().click();

      // Verify slip status changed - look for "paused" indicator
      cy.contains('Paused', { timeout: 5000 }).should('be.visible');

      // Resume button should now be visible
      cy.get('[aria-label*="Resume"], [aria-label*="Play"]').should('exist');
    });

    it('should resume a paused rating slip', () => {
      // First pause the slip
      cy.get('[aria-label*="Pause"]').first().click();

      // Wait for pause to complete
      cy.contains('Paused', { timeout: 5000 }).should('be.visible');

      // Now resume it
      cy.get('[aria-label*="Resume"], [aria-label*="Play"]').first().click();

      // Verify slip is active again - "Paused" text should disappear or change
      cy.contains('Active', { timeout: 5000 }).should('be.visible');
    });
  });

  /**
   * CLOSE RATING SLIP TESTS (3 tests)
   * Opens Rating Slip Modal to close active sessions
   */
  describe('Close Rating Slip', () => {
    beforeEach(() => {
      // Switch to Activity panel to see active slips
      cy.contains('button', 'Activity').click();
      cy.wait(1000);
    });

    it('should open rating slip modal when clicking on an active slip', () => {
      // Click on an active slip card to open modal
      // Active slips show player name and table info
      cy.get('.cursor-pointer, [role="button"]')
        .contains(/Seat|Table/)
        .first()
        .click();

      // Verify modal opens with rating slip details
      cy.get('[role="dialog"]').should('be.visible');
      cy.contains('Rating Slip').should('be.visible');
    });

    it('should display close session button in the modal', () => {
      // Open the modal by clicking an active slip
      cy.get('.cursor-pointer, [role="button"]')
        .contains(/Seat|Table/)
        .first()
        .click();

      // Verify close session button exists
      cy.get('[role="dialog"]').within(() => {
        cy.contains('button', 'Close Session').should('exist');
      });
    });

    it('should close a rating slip successfully', () => {
      // Open the modal by clicking an active slip
      cy.get('.cursor-pointer, [role="button"]')
        .contains(/Seat|Table/)
        .first()
        .click();

      cy.get('[role="dialog"]').should('be.visible');

      // Enter average bet if the field exists
      cy.get('[role="dialog"]').within(() => {
        cy.get('input').first().clear().type('50');
      });

      // Click close session
      cy.get('[role="dialog"]').within(() => {
        cy.contains('button', 'Close Session').click();
      });

      // Verify success message (toast)
      cy.contains('closed', { timeout: 10000 }).should('be.visible');

      // Modal should close
      cy.get('[role="dialog"]').should('not.exist');
    });
  });

  /**
   * MOVE PLAYER TESTS (3 tests)
   * Uses Rating Slip Modal to move players between tables
   */
  describe('Move Player Between Tables', () => {
    beforeEach(() => {
      // Switch to Activity panel to see active slips
      cy.contains('button', 'Activity').click();
      cy.wait(1000);
    });

    it('should display move player section in the modal', () => {
      // Open the modal by clicking an active slip
      cy.get('.cursor-pointer, [role="button"]')
        .contains(/Seat|Table/)
        .first()
        .click();

      // Verify move player section exists
      cy.get('[role="dialog"]').within(() => {
        cy.contains('Move Player').should('exist');
      });
    });

    it('should show available tables for move', () => {
      // Open the modal
      cy.get('.cursor-pointer, [role="button"]')
        .contains(/Seat|Table/)
        .first()
        .click();

      // Find the table dropdown/select
      cy.get('[role="dialog"]').within(() => {
        cy.get('select, [role="combobox"]').should('exist');
      });
    });

    it('should move player to a different table successfully', () => {
      // Open the modal
      cy.get('.cursor-pointer, [role="button"]')
        .contains(/Seat|Table/)
        .first()
        .click();

      cy.get('[role="dialog"]').should('be.visible');

      // Select a different table (change the dropdown value)
      cy.get('[role="dialog"]').within(() => {
        cy.get('select').first().select(1); // Select second option

        // Select a seat at the new table
        cy.get('select').eq(1).select(1);

        // Click move button
        cy.contains('button', 'Move').click();
      });

      // Verify success message
      cy.contains('moved', { timeout: 10000 }).should('be.visible');
    });
  });

  /**
   * COMPLETE WORKFLOW TEST (1 test)
   * Full lifecycle: start → pause → resume → close
   */
  describe('Complete Rating Slip Lifecycle', () => {
    it('should complete full rating slip lifecycle successfully', () => {
      // STEP 1: START - Create a new rating slip
      cy.contains('button', 'New Slip').click();
      cy.get('[role="dialog"]').should('be.visible');

      // Search and select a player
      cy.get('[role="dialog"]').within(() => {
        cy.get('input[placeholder*="Search"], input[type="search"]').type('Test');
      });

      // Wait for and click a player result
      cy.get('[role="dialog"]').find('[role="option"], .cursor-pointer').first().click();

      // Select seat and start session
      cy.get('[role="dialog"]').within(() => {
        cy.get('button').filter(':contains("1"), :contains("2"), :contains("3")')
          .not('[disabled]')
          .first()
          .click();
        cy.contains('button', 'Start').click();
      });

      // Verify creation
      cy.contains('started', { timeout: 10000 }).should('be.visible');

      // Wait for UI to update
      cy.wait(2000);

      // STEP 2: PAUSE - Switch to Activity and pause the rating slip
      cy.contains('button', 'Activity').click();
      cy.wait(1000);
      cy.get('[aria-label*="Pause"]').first().click();

      // Verify paused
      cy.contains('Paused', { timeout: 5000 }).should('be.visible');

      // STEP 3: RESUME - Resume the rating slip
      cy.get('[aria-label*="Resume"], [aria-label*="Play"]').first().click();

      // Verify resumed
      cy.contains('Active', { timeout: 5000 }).should('be.visible');

      // STEP 4: CLOSE - Open modal and close the rating slip
      cy.get('.cursor-pointer, [role="button"]')
        .contains(/Seat|Table/)
        .first()
        .click();

      cy.get('[role="dialog"]').should('be.visible');

      // Enter final details
      cy.get('[role="dialog"]').within(() => {
        cy.get('input').first().clear().type('75');
        cy.contains('button', 'Close Session').click();
      });

      // Verify success
      cy.contains('closed', { timeout: 10000 }).should('be.visible');

      // Modal should close
      cy.get('[role="dialog"]').should('not.exist');
    });
  });

  /**
   * PERFORMANCE TESTS (2 tests)
   */
  describe('Performance Tests', () => {
    it('should load the pit dashboard within 3 seconds', () => {
      const startTime = Date.now();

      cy.visit(pitDashboardUrl);
      cy.get('[data-panel-group]', { timeout: 15000 })
        .should('exist')
        .then(() => {
          const loadTime = Date.now() - startTime;
          expect(loadTime).to.be.lessThan(3000);
        });
    });

    it('should open rating slip modal within 1 second', () => {
      // Switch to Activity panel
      cy.contains('button', 'Activity').click();
      cy.wait(1000);

      const startTime = Date.now();

      // Click on an active slip
      cy.get('.cursor-pointer, [role="button"]')
        .contains(/Seat|Table/)
        .first()
        .click();

      // Wait for modal to appear
      cy.get('[role="dialog"]')
        .should('be.visible')
        .then(() => {
          const modalOpenTime = Date.now() - startTime;
          expect(modalOpenTime).to.be.lessThan(1000);
        });
    });
  });

  /**
   * ERROR HANDLING TESTS (2 tests)
   */
  describe('Error Handling', () => {
    it('should show error when starting slip without selecting player', () => {
      // Open new slip modal
      cy.contains('button', 'New Slip').click();
      cy.get('[role="dialog"]').should('be.visible');

      // Try to start without selecting a player (just click start)
      cy.get('[role="dialog"]').within(() => {
        cy.contains('button', 'Start').click();
      });

      // Should show validation error or button should be disabled
      cy.get('[role="dialog"]').within(() => {
        // Check for error message or disabled state
        cy.get('.text-red-500, .text-destructive, [role="alert"]').should('exist');
      });
    });

    it('should handle network errors gracefully', () => {
      // Intercept API calls and force an error
      cy.intercept('POST', '/api/v1/rating-slips*', {
        statusCode: 500,
        body: { error: 'Internal Server Error' },
      }).as('createSlip');

      // Open new slip modal and try to create
      cy.contains('button', 'New Slip').click();
      cy.get('[role="dialog"]').should('be.visible');

      // Search and select a player
      cy.get('[role="dialog"]').within(() => {
        cy.get('input[placeholder*="Search"], input[type="search"]').type('Test');
      });

      cy.get('[role="dialog"]').find('[role="option"], .cursor-pointer').first().click();

      // Select a seat and submit
      cy.get('[role="dialog"]').within(() => {
        cy.get('button').filter(':contains("1"), :contains("2")')
          .not('[disabled]')
          .first()
          .click();
        cy.contains('button', 'Start').click();
      });

      // Wait for the intercepted request
      cy.wait('@createSlip');

      // Should show error message (toast or inline)
      cy.contains(/error|failed/i, { timeout: 5000 }).should('be.visible');
    });
  });

  /**
   * ACCESSIBILITY TESTS (2 tests)
   */
  describe('Accessibility', () => {
    it('should support keyboard navigation in the dashboard', () => {
      // Tab through interactive elements - find first focusable element
      cy.get('button').first().focus();
      cy.focused().should('exist');

      // Press Tab to move through elements
      cy.focused().tab();
      cy.focused().should('exist');
    });

    it('should have proper ARIA labels on modal controls', () => {
      // Open a modal
      cy.contains('button', 'New Slip').click();
      cy.get('[role="dialog"]').should('be.visible');

      // Verify dialog has proper ARIA attributes
      cy.get('[role="dialog"]').within(() => {
        // Check for accessible name (aria-labelledby or aria-label)
        cy.root().should('satisfy', ($el) => {
          return $el.attr('aria-labelledby') || $el.attr('aria-label');
        });

        // Check for close button
        cy.get('button').should('have.length.greaterThan', 0);
      });
    });
  });
});
