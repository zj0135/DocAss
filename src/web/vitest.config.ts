import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts'],environment:'node',reporters:['default','json'],outputFile:{json:'../../artifacts/web-tests.json'}}});
