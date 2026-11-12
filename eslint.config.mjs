import antfu from '@antfu/eslint-config'

// Correctness, not formatting: the code keeps its own style, so the stylistic
// rules (and Vue's template formatting rules) are off.
export default antfu(
  {
    vue: true,
    typescript: true,
    stylistic: false,
    // Docs are prose; their code blocks are examples, not project code.
    markdown: false,
    ignores: ['dist', '.github', 'demo/**/node_modules', 'demo/**/.vitepress/cache', 'demo/**/.vitepress/dist', 'test-results', 'playwright-report'],
  },
  {
    rules: {
      // Composables refer to state that is created later in the same setup;
      // the callbacks only run after setup.
      'ts/no-use-before-define': 'off',
      'node/prefer-global/buffer': 'off',
      'node/prefer-global/process': 'off',
      'jsonc/sort-keys': 'off',
      'test/prefer-lowercase-title': 'off',
      'unicorn/number-literal-case': 'off',
      // pnpm-workspace.yaml only lists the packages; pnpm settings stay as they are.
      'pnpm/yaml-enforce-settings': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/html-indent': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },
  {
    files: ['e2e/**', 'scripts/**', 'src/**/__tests__/**'],
    rules: {
      'no-console': 'off',
      // e2e reads what is rendered on screen.
      'unicorn/prefer-dom-node-text-content': 'off',
    },
  },
)
