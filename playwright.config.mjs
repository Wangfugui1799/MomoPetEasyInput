import {defineConfig} from '@playwright/test';
// A test-owned server avoids reusing a desktop/browser session with stale modules.
const port=Number(process.env.MOMO_TEST_PORT||4785),url=`http://127.0.0.1:${port}`;
export default defineConfig({testDir:'./tests/ui',fullyParallel:false,workers:1,timeout:20000,use:{baseURL:url,viewport:{width:1280,height:950},launchOptions:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'},screenshot:'only-on-failure'},webServer:{command:'node server.mjs',env:{PORT:String(port)},url,reuseExistingServer:false}});
