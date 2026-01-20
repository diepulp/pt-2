/// <reference types="cypress" />
/// <reference types="@testing-library/cypress" />
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

// Custom command for Supabase auth login (example)
Cypress.Commands.add("login", (email: string, password: string) => {
  cy.visit("/login");
  cy.findByLabelText(/email/i).type(email);
  cy.findByLabelText(/password/i).type(password);
  cy.findByRole("button", { name: /sign in/i }).click();
  cy.url().should("not.include", "/login");
});

// Custom command to create a player
Cypress.Commands.add(
  "createPlayer",
  (playerData: { email: string; firstName: string; lastName: string }) => {
    cy.visit("/players");
    cy.get("#email").type(playerData.email);
    cy.get("#firstName").type(playerData.firstName);
    cy.get("#lastName").type(playerData.lastName);
    cy.contains("button", "Create Player").click();
    cy.contains("Player created successfully", { timeout: 10000 }).should(
      "be.visible",
    );
  },
);

// Custom command to generate unique test player data
Cypress.Commands.add("generateTestPlayer", () => {
  return {
    email: `test-${Date.now()}@example.com`,
    firstName: "Test",
    lastName: "User",
  };
});

// Custom command for keyboard tab navigation
Cypress.Commands.add("tab", { prevSubject: "element" }, (subject) => {
  cy.wrap(subject).trigger("keydown", { key: "Tab", code: "Tab", keyCode: 9 });
});

// Custom command to create a visit
Cypress.Commands.add(
  "createVisit",
  (visitData: {
    playerId: string;
    casinoId: string;
    status?: string;
    mode?: string;
  }) => {
    cy.visit("/visits");
    cy.contains("button", "Create Visit").click();

    // Fill out the form
    cy.get('select[name="playerId"]').select(visitData.playerId);
    cy.get('select[name="casinoId"]').select(visitData.casinoId);

    if (visitData.status) {
      cy.get('select[name="status"]').select(visitData.status);
    }

    if (visitData.mode) {
      cy.get('select[name="mode"]').select(visitData.mode);
    }

    // Submit the form
    cy.contains("button", "Save").click();
    cy.contains("Visit created successfully", { timeout: 10000 }).should(
      "be.visible",
    );
  },
);

// Custom command to generate unique test visit data
Cypress.Commands.add("generateTestVisit", () => {
  return {
    playerId: Cypress.env("TEST_PLAYER_ID") || "test-player-id",
    casinoId: Cypress.env("TEST_CASINO_ID") || "test-casino-id",
    checkInDate: new Date().toISOString(),
    status: "ONGOING",
    mode: "UNRATED",
  };
});

// Custom command to end a visit (set check-out date)
Cypress.Commands.add("endVisit", (visitId: string) => {
  cy.visit("/visits");

  // Find the visit row and click edit
  cy.get(`[data-visit-id="${visitId}"]`).within(() => {
    cy.get('button[aria-label="Edit visit"]').click();
  });

  // Click end visit button
  cy.contains("button", "End Visit").click();
  cy.contains("button", "Confirm").click();

  // Verify success
  cy.contains("Visit ended successfully", { timeout: 10000 }).should(
    "be.visible",
  );
});

// Custom command to delete a visit
Cypress.Commands.add("deleteVisit", (visitId: string) => {
  cy.visit("/visits");

  // Find the visit row and click delete
  cy.get(`[data-visit-id="${visitId}"]`).within(() => {
    cy.get('button[aria-label="Delete visit"]').click();
  });

  // Confirm deletion
  cy.contains("button", "Delete").click();

  // Verify success
  cy.contains("Visit deleted successfully", { timeout: 10000 }).should(
    "be.visible",
  );
});

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
      createPlayer(playerData: {
        email: string;
        firstName: string;
        lastName: string;
      }): Chainable<void>;
      generateTestPlayer(): {
        email: string;
        firstName: string;
        lastName: string;
      };
      tab(): Chainable<JQuery<HTMLElement>>;
      createVisit(visitData: {
        playerId: string;
        casinoId: string;
        status?: string;
        mode?: string;
      }): Chainable<void>;
      generateTestVisit(): {
        playerId: string;
        casinoId: string;
        checkInDate: string;
        status: string;
        mode: string;
      };
      endVisit(visitId: string): Chainable<void>;
      deleteVisit(visitId: string): Chainable<void>;
    }
  }
}

export {};
