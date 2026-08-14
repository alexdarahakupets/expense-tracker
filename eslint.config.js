import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Match tsconfig's noUnusedLocals/noUnusedParameters, which exempt the
      // `_` prefix. Needed for things like Express's 4-arg error handlers,
      // where an unused param is load-bearing.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    // `configs.flat.*` are the flat-config forms; the top-level `configs.recommended`
    // and `configs['recommended-latest']` are legacy eslintrc shapes.
    ...reactHooks.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Config files at the repo root run in Node.
    files: ['*.js', '**/*.config.{js,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
