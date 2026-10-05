import { i18n } from './index';
import { ServiceError } from '@/services/httpClient';

const serviceErrorKeys: Readonly<Record<string, string>> = {
  'authentication.required': 'authentication.required',
  permission_denied: 'permissionDenied',
  unauthorized: 'authentication.required',
  forbidden: 'permissionDenied',
  conflict: 'conflict',
  not_found: 'notFound',
  validation_failed: 'validationFailed',
  'http.400': 'validationFailed',
  'http.401': 'authentication.required',
  'http.403': 'permissionDenied',
  'http.404': 'notFound',
  'http.409': 'conflict',
};

export function localizedErrorMessage(error: unknown, fallbackKey = 'generic') {
  if (error instanceof ServiceError) {
    const key = serviceErrorKeys[error.code] || serviceErrorKeys[`http.${error.status}`] || fallbackKey;
    if (!serviceErrorKeys[error.code]) {
      console.error('Unmapped service error', {
        code: error.code,
        status: error.status,
        detail: error.diagnosticDetail,
        payload: error.payload,
      });
    }
    return i18n.t(`errors:${key}`);
  }
  if (error instanceof Error) {
    console.error('Unmapped client error', error);
  }
  return i18n.t(`errors:${fallbackKey}`);
}
