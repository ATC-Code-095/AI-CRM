// ESLint flat config（全仓共用）。各包 `pnpm lint` 会向上找到本文件。
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/*.d.ts',
      '.pnpm-store/**',
      'apps/mobile/**',
      'apps/harmony/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // 存量代码大量使用 any 对接 Prisma JSON / 第三方返回，暂不约束
      '@typescript-eslint/no-explicit-any': 'off',
      // try/catch 前先给默认值是本仓惯用写法
      'no-useless-assignment': 'off',
      // 打印模板里的全角空格、BOM 正则是有意为之
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipRegExps: true, skipJSXText: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}', 'scripts/**', 'e2e/**', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
)
