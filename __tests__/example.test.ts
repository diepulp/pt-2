/**
 * Example test file demonstrating testing patterns
 * DELETE THIS FILE once real tests are written
 */

describe('Example Test Suite', () => {
  it('should pass a basic test', () => {
    expect(true).toBe(true)
  })

  it('should demonstrate async testing', async () => {
    const asyncFunction = async () => 'result'
    const result = await asyncFunction()
    expect(result).toBe('result')
  })
})
