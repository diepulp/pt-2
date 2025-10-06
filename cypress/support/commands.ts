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

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>
    }
  }
}

export {}
