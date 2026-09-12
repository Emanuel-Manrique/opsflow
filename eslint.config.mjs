import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/dist', '**/coverage', '**/node_modules', '**/.nx', '**/.angular', '**/tmp', '**/vitest.config.*.timestamp*', '.agents/**'],
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts', '**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@nx': nx },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          allow: [],
          depConstraints: [
            {
              sourceTag: 'type:domain',
              onlyDependOnLibsWithTags: [],
            },
            {
              sourceTag: 'type:contracts',
              onlyDependOnLibsWithTags: ['type:domain'],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:contracts', 'type:domain'],
            },
            {
              sourceTag: 'type:testing',
              onlyDependOnLibsWithTags: ['type:contracts', 'type:domain'],
            },
            {
              sourceTag: 'type:persistence',
              onlyDependOnLibsWithTags: ['type:contracts', 'type:domain'],
            },
            {
              sourceTag: 'type:observability',
              onlyDependOnLibsWithTags: [],
            },
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:contracts',
                'type:domain',
                'type:persistence',
                'type:observability',
                'type:ui',
              ],
            },
            {
              sourceTag: 'type:e2e',
              onlyDependOnLibsWithTags: [
                'type:contracts',
                'type:domain',
                'type:testing',
                'type:ui',
              ],
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'],
            },
            {
              sourceTag: 'scope:server',
              onlyDependOnLibsWithTags: ['scope:server', 'scope:shared'],
            },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: [
                'scope:api',
                'scope:server',
                'scope:shared',
              ],
            },
            {
              sourceTag: 'scope:orchestrator',
              onlyDependOnLibsWithTags: [
                'scope:orchestrator',
                'scope:server',
                'scope:shared',
              ],
            },
            {
              sourceTag: 'scope:worker',
              onlyDependOnLibsWithTags: [
                'scope:server',
                'scope:shared',
                'scope:worker',
              ],
            },
          ],
        },
      ],
    },
  },
];
