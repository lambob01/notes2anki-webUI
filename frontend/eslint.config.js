// ESLint 9/10 flat config. Scope is deliberately narrow, mirroring the
// backend's ruff.toml: this exists to catch real problems (undef, no-cond,
// stale hooks deps), not to restyle. `any` and unused vars are left to tsc and
// the codebase's any-heavy convention.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // react-hooks v7 added this opinionated rule; the two spots it flags
      // (reset highlight on query change, clamp index when a list shrinks) are
      // deliberate sync-to-state patterns, not bugs.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
)
