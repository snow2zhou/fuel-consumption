import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.fuelconsumption.app',
  appName: '油耗记录',
  webDir: 'dist',
  backgroundColor: '#f7f8fa',
  android: {
    backgroundColor: '#f7f8fa',
    allowMixedContent: false
  },
  server: {
    androidScheme: 'https'
  }
}

export default config
