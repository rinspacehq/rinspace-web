import { requestAdminJson } from '../httpClient';

export { loadAdminAnswerPage, adminUpdateAnswerStatus, loadAdminContentPage, adminUpdateContentStatus, adminUpdateContentTags, adminDeleteContent, loadAdminQuestionPage, adminUpdateQuestionStatus, loadAdminUserPage, adminUpdateUserStatus } from '../feed';

export async function setAnnouncementPinned(id: string, pinned: boolean) {
  await requestAdminJson<null>(`content/announcements/${encodeURIComponent(id)}/pin`, {
    method: 'PUT',
    auth: 'required',
    body: { pinned },
  });
}
