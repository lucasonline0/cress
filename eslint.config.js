import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(...tseslint.configs.recommended, {
  files: ['**/*.ts'], languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  rules: { '@typescript-eslint/no-explicit-any': 'error' },
}, { ignores: ['dist/**', 'node_modules/**'] });
