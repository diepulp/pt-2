export default {
  '**/*.{ts,tsx,js,json,md}': (filenames) => {
    // Filter out test files, config files, and docs from linting
    const ignoredPatterns = [
      '__tests__/',
      'cypress/',
      '*.test.ts',
      '*.test.tsx',
      '*.spec.ts',
      '*.spec.tsx',
      'jest.config.js',
      'jest.setup.js',
      'cypress.config.ts',
      'docs/',
      'supabase/migrations/',
      'package.json',
      'package-lock.json',
      'components/landing-page/ui/', // shadcn/ui generated components
    ]

    const filteredFiles = filenames.filter(
      (file) => !ignoredPatterns.some((pattern) => file.includes(pattern)),
    )

    if (filteredFiles.length === 0) return []

    return [
      `eslint --fix ${filteredFiles.join(' ')}`,
      `prettier --write ${filteredFiles.join(' ')}`,
    ]
  },
}
