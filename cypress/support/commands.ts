/// <reference types="cypress" />
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
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.visit('/login')
  cy.findByLabelText(/email/i).type(email)
  cy.findByLabelText(/password/i).type(password)
  cy.findByRole('button', { name: /sign in/i }).click()
  cy.url().should('not.include', '/login')
})

// Custom command to create a player
Cypress.Commands.add(
  'createPlayer',
  (playerData: { email: string; firstName: string; lastName: string }) => {
    cy.visit('/players')
    cy.get('#email').type(playerData.email)
    cy.get('#firstName').type(playerData.firstName)
    cy.get('#lastName').type(playerData.lastName)
    cy.contains('button', 'Create Player').click()
    cy.contains('Player created successfully', { timeout: 10000 }).should('be.visible')
  }
)

// Custom command to generate unique test player data
Cypress.Commands.add('generateTestPlayer', () => {
  return {
    email: `test-${Date.now()}@example.com`,
    firstName: 'Test',
    lastName: 'User',
  }
})

// Custom command for keyboard tab navigation
Cypress.Commands.add('tab', { prevSubject: 'element' }, (subject) => {
  cy.wrap(subject).trigger('keydown', { key: 'Tab', code: 'Tab', keyCode: 9 })
})

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>
      createPlayer(playerData: {
        email: string
        firstName: string
        lastName: string
      }): Chainable<void>
      generateTestPlayer(): { email: string; firstName: string; lastName: string }
      tab(): Chainable<JQuery<HTMLElement>>
    }
  }
}

export {}
