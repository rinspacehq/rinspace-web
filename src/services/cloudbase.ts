import { publicEnv } from '@/app/config/env';
import cloudbase from './cloudbaseVendor';

const env = publicEnv.cloudbaseEnvId || '';
const region = publicEnv.cloudbaseRegion || 'ap-shanghai';
const accessKey = publicEnv.cloudbaseAccessKey || '';

function requireCloudBaseEnv() {
  if (!env) {
    throw new Error('CloudBase env is required.');
  }
}

let appInstance: ReturnType<typeof cloudbase.init> | null = null;

export function getCloudBaseApp() {
  requireCloudBaseEnv();
  if (!appInstance) {
    appInstance = cloudbase.init({
      env,
      region,
      ...(accessKey ? { accessKey, auth: { detectSessionInUrl: true } } : {}),
    });
  }
  return appInstance;
}

export function getCloudBaseAuth() {
  return getCloudBaseApp().auth({ persistence: 'local' });
}

export { env, region, accessKey };
