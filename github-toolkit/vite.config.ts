import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'GitHub Toolkit',
        namespace: 'github-toolkit',
        version: '2.6.0',
        description: '高内聚低耦合的 GitHub 模块化工具台（图标操作 + 复制上游链接）',
        author: 'Cores',
        icon: 'https://github.githubassets.com/favicons/favicon.svg',
        match: [
          'https://github.com/*',
          'https://gist.github.com/*',
        ],
        grant: [
          'GM_setValue',
          'GM_getValue',
          'GM_deleteValue',
          'GM_addStyle',
          'GM_registerMenuCommand',
          'GM_xmlhttpRequest',
        ],
        connect: [
          'api.github.com',
        ],
        'run-at': 'document-idle',
      },
      build: {
        fileName: 'github-toolkit.user.js',
        metaFileName: true,
      },
      server: {
        open: false,
      },
    }),
  ],
  build: {
    minify: false, // userscript 可读性更好，体积也够小
    target: 'es2022',
  },
});
