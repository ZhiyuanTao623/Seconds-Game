import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 构建产物仍然是「双击即可打开的单个 HTML」——
// 这是原型阶段最重要的分发属性，不能因为引入构建工具就丢掉。
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
