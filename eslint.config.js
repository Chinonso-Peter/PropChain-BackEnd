import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, prettierConfig, {
  plugins: { prettier: prettierPlugin },
  rules: {
    // Prettier formatting as ESLint errors
    'prettier/prettier': 'error',

    // Naming conventions
    '@typescript-eslint/naming-convention': [
      'error',
      { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
      { selector: 'function', format: ['camelCase', 'PascalCase'] },
      { selector: 'typeLike', format: ['PascalCase'] }, // interfaces, types, classes
      { selector: 'enumMember', format: ['UPPER_CASE'] },
    ],

    // General best practices
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    eqeqeq: ['error', 'always'],
    'no-console': 'warn',
  },
});
