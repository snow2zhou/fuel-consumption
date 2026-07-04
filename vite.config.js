import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    Components({
      resolvers: [VantResolver()]
    }),
    VitePWA({
      // 注册模式：autoPrompt=false 避免弹窗，由应用自行控制（或使用默认提示）
      registerType: 'autoUpdate',
      injectRegister: 'auto', // 自动注入 SW 注册脚本到 index.html
      devOptions: {
        enabled: false // 开发模式禁用 SW，避免缓存干扰调试
      },
      manifest: {
        name: '油耗记录',
        short_name: '油耗记录',
        description: '记录加油与行程数据，自动计算油耗与费用，支持离线使用',
        theme_color: '#1989fa',
        background_color: '#f7f8fa',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'zh-CN',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/apple-touch-icon-180.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        // 预缓存：所有静态资源（JS/CSS/HTML/图标）
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // 预缓存大小上限（默认 2MB，ECharts 较大，调到 10MB）
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // 运行时缓存：动态请求按需缓存（本项目主要为静态资源，预留扩展）
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 年
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ],
        // 跳过等待，立即激活
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500
  }
})
