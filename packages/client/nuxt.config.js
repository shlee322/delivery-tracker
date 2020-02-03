const isProd = process.env.NODE_ENV === 'production'
const apiBaseURL = process.env.API_ENDPOINT ? process.env.API_ENDPOINT : isProd ? 'https://apis.tracker.delivery' : 'http://localhost:8080'

module.exports = {
  modules: [
    '@nuxtjs/axios',
    ['nuxt-buefy', { css: false, materialDesignIcons: false }],
  ],
  plugins: ['~plugins/vue-highlightjs', '~plugins/i18n.js'],
  build: {
    postcss: {
      plugins: {
        // disable warning
        'postcss-custom-properties': false
      }
    },
    extractCSS: isProd,
    analyze: true,
    vendor: ['vue-highlightjs']
  },
  generate: {
    fallback: true
  },
  css: [
    '@/assets/custom.scss',
  ],
  head: {
    titleTemplate: 'Delivery Tracker',
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, user-scalable=no' },
      { name: 'apple-mobile-web-capable', content: 'yes' },
      { name: 'theme-color', content: '#c6c6c6' },
      { name: 'application-name', content: 'Delivery Tracker' },
    ],
    link: [
      { rel: 'icon', sizes: '192x192', href: '/icon-192.png' },
      { rel: 'icon', sizes: '128x128', href: '/icon-128.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/icon-180.png' },
      { rel: 'apple-touch-icon', sizes: '167x167', href: '/icon-167.png' },
      { rel: 'apple-touch-icon', sizes: '152x152', href: '/icon-152.png' },
      { rel: 'apple-touch-icon', sizes: '120x120', href: '/icon-120.png' },
      { rel: 'apple-touch-icon', sizes: '76x76', href: '/icon-76.png' },
    ]
  },
  loading: {
    color: '#666666',
    failedColor: '#e24949',
    height: '1px',
  },
  axios: {
    baseURL: apiBaseURL,
  }
}
