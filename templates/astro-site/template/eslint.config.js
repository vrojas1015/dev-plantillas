// ESLint (flat config): TypeScript + Astro + reglas de hooks de React para las islas.
// El formato lo controla prettier; acá sólo errores de código.
import astro from 'eslint-plugin-astro'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/', '.astro/', 'node_modules/', '.lighthouseci/'] },
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
