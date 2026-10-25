import { Icon, AnimateButton, AnimateRadialMenu } from 'components/ui';
import './RinAssistant.css';
import { publicEnv } from '@/app/config/env';
import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import CodeMirrorEditor from '@/components/CodeMirrorEditor';
import MathText from '@/components/MathText';
import RinStickerPicker from '@/components/RinStickerPicker';
import { CollectionFolderWorkspace } from '@/pages/Profile';
import { ApiRequestError, loadRinChat, loadRinChatPrice, sendRinChatMessage } from '@/services/domains/assistant';
import type { RinChatPrice } from '@/services/domains/assistant';
import { messageFromError } from '@/services/errors';
import type { RinChatContext, RinChatConversation, RinChatMessage, RinWebSearchMode } from '@/services/contracts';
import type {
  RinPageContextAnswer,
  RinPageContextComment,
  RinPageContextDraft,
  RinPageContextSection,
  RinPageContextSnapshot,
} from '@/types/rinPageContext';
import { appendRinStickerToken } from '@/utils/rinStickers';

type Point = {
  x: number;
  y: number;
};

type CaretDocument = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

type WindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DragState =
  | {
      type: 'move';
      pointerId: number;
      startX: number;
      startY: number;
      frame: WindowFrame;
    }
  | {
      type: 'resize';
      pointerId: number;
      startX: number;
      startY: number;
      frame: WindowFrame;
    };

type PendingRinSend = {
  body: string;
  context: RinChatContext;
  messages: RinChatMessage[];
  webSearchMode: RinWebSearchMode;
  idempotencyKey: string;
  policyVersion: number;
  priceSg: number;
  optimisticId: number;
};

const frameStorageKey = 'rinspace-rin-assistant-frame';
const collectionFrameStorageKey = 'rinspace-collection-window-frame';
const localMessagesStoragePrefix = 'rinspace-rin-chat-local-messages';
const localMessageLimit = 80;
const localMessageBodyLimit = 8000;
const defaultFrame: WindowFrame = {
  x: Math.max(16, window.innerWidth - 420),
  y: Math.max(72, window.innerHeight - 580),
  width: 380,
  height: 520,
};
const defaultCollectionFrame: WindowFrame = {
  x: Math.max(16, Math.round((window.innerWidth - 940) / 2)),
  y: Math.max(72, Math.round((window.innerHeight - 660) / 2)),
  width: Math.min(940, Math.max(360, window.innerWidth - 32)),
  height: Math.min(660, Math.max(420, window.innerHeight - 40)),
};
function readLocalStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeLocalStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage; the assistant can continue without local cache.
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampFrame(frame: WindowFrame): WindowFrame {
  const minWidth = Math.min(320, window.innerWidth - 24);
  const minHeight = Math.min(380, window.innerHeight - 24);
  const maxWidth = Math.max(minWidth, window.innerWidth - 24);
  const maxHeight = Math.max(minHeight, window.innerHeight - 24);
  const width = clamp(frame.width, minWidth, maxWidth);
  const height = clamp(frame.height, minHeight, maxHeight);
  return {
    width,
    height,
    x: clamp(frame.x, 12, Math.max(12, window.innerWidth - width - 12)),
    y: clamp(frame.y, 12, Math.max(12, window.innerHeight - height - 12)),
  };
}

function storedFrameByKey(key: string, fallback: WindowFrame) {
  const raw = readLocalStorage(key);
  if (!raw) return clampFrame(fallback);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'x' in parsed &&
      'y' in parsed &&
      'width' in parsed &&
      'height' in parsed
    ) {
      const candidate = parsed as Record<string, unknown>;
      if (
        typeof candidate.x === 'number' &&
        typeof candidate.y === 'number' &&
        typeof candidate.width === 'number' &&
        typeof candidate.height === 'number'
      ) {
        return clampFrame({
          x: candidate.x,
          y: candidate.y,
          width: candidate.width,
          height: candidate.height,
        });
      }
    }
  } catch {
    removeLocalStorage(key);
  }
  return clampFrame(fallback);
}

function storedFrame() {
  return storedFrameByKey(frameStorageKey, defaultFrame);
}

function storedCollectionFrame() {
  return storedFrameByKey(collectionFrameStorageKey, defaultCollectionFrame);
}

function isNativeContextMenuTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      [
        'input',
        'textarea',
        'select',
        'option',
        'button',
        'a',
        'label',
        'details',
        'summary',
        '[role="button"]',
        '[role="textbox"]',
        '[contenteditable]:not([contenteditable="false"])',
        '.cm-editor',
        '.code-editor',
        '.ProseMirror',
        '.milkdown-editor-host',
        '.rin-editor-host',
        '.modal',
        '.dropdown-menu',
        '.popover',
        '.tooltip',
        '.rin-assistant-window',
        '.rin-collection-window',
        '.rin-context-menu',
        '.rin-radial-menu',
        '[data-native-context-menu="true"]',
        '[data-rin-native-context-menu="true"]',
        '.markdown-body',
        '.rin-writer-article',
        '.detail-body',
        '.detail-content',
        '.detail-article',
        '.blog-detail-article',
        '.question-detail',
        '.post-detail',
        '.wiki-entry-body',
        '.review-detail-section',
        '.stream-card',
        '.discussion-card',
        '.search-result-card',
        '.questions-row',
        'p',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'li',
        'blockquote',
        'figcaption',
        'caption',
        'table',
        'th',
        'td',
        'pre',
        'code',
        'time',
        'q',
        'cite',
        'kbd',
        'samp',
        'var',
        'img',
        'svg',
        'audio',
        'video',
        'canvas',
        'iframe',
        'embed',
        'object',
      ].join(','),
    ),
  );
}

function hasActiveTextSelection() {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

function isTextAtPoint(x: number, y: number) {
  const caretDocument = document as CaretDocument;
  const caret = caretDocument.caretRangeFromPoint?.(x, y);
  const position = caretDocument.caretPositionFromPoint?.(x, y);
  const node = caret?.startContainer ?? position?.offsetNode;
  const offset = caret?.startOffset ?? position?.offset ?? 0;
  if (node?.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return false;
  // Caret APIs also return the *nearest* text when clicking empty page space.
  // Only protect text whose actual character boxes contain the pointer.
  const range = document.createRange();
  range.setStart(node, Math.max(0, offset - 1));
  range.setEnd(node, Math.min(node.textContent.length, offset + 1));
  return Array.from(range.getClientRects()).some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
}

function shouldUseNativeContextMenu(event: MouseEvent) {
  return hasActiveTextSelection() || isNativeContextMenuTarget(event.target) || isTextAtPoint(event.clientX, event.clientY);
}

function textFromPage() {
  const root = document.querySelector('article, main, .detail-page, .question-detail, .post-detail') || document.body;
  return (root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 3200);
}

function compactText(value: string | undefined, limit: number) {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function multilineText(value: string | undefined, limit: number) {
  const text = (value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function formatPageComment(comment: RinPageContextComment, index: number) {
  const reply = comment.replyToAuthor ? ` 回复 ${comment.replyToAuthor}` : '';
  const score = typeof comment.voteCount === 'number' ? `，赞同 ${comment.voteCount}` : '';
  return `${index + 1}. ${comment.author}${reply}${score}：${compactText(comment.body, 360)}`;
}

function formatPageAnswer(answer: RinPageContextAnswer, index: number) {
  const meta = [
    answer.accepted ? '已采纳' : '',
    typeof answer.voteCount === 'number' ? `赞同 ${answer.voteCount}` : '',
  ].filter(Boolean).join('，');
  const lines = [
    `${index + 1}. ${answer.author}${meta ? `（${meta}）` : ''}`,
    multilineText(answer.body, 1200),
  ];
  if (answer.comments?.length) {
    lines.push(
      '回答评论：',
      ...answer.comments.slice(0, 8).map(formatPageComment),
    );
  }
  return lines.filter(Boolean).join('\n');
}

function formatPageDraft(draft: RinPageContextDraft, index: number) {
  return `${index + 1}. ${draft.label}\n${multilineText(draft.body, 1600)}`;
}

function formatPageSection(section: RinPageContextSection) {
  return `${section.title}：\n${multilineText(section.body, 1200)}`;
}

function structuredPageText(snapshot: RinPageContextSnapshot) {
  const renderedText = textFromPage();
  const bodyText =
    snapshot.kind === 'blog' && renderedText
      ? renderedText
      : snapshot.body;
  const parts = [
    '当前页面结构化上下文',
    `类型：${snapshot.kind}`,
    snapshot.id ? `编号：${snapshot.id}` : '',
    snapshot.slug ? `Slug：${snapshot.slug}` : '',
    `标题：${snapshot.title}`,
    snapshot.author ? `作者：${snapshot.author}` : '',
    snapshot.tags?.length ? `标签：${snapshot.tags.join('、')}` : '',
    snapshot.updatedAt ? `更新时间：${snapshot.updatedAt}` : '',
    snapshot.excerpt ? `摘要：${compactText(snapshot.excerpt, 500)}` : '',
    bodyText ? `正文：\n${multilineText(bodyText, 4000)}` : '',
    snapshot.sections?.length
      ? `附加信息：\n${snapshot.sections.map(formatPageSection).join('\n\n')}`
      : '',
    snapshot.comments?.length
      ? `评论：\n${snapshot.comments.slice(0, 30).map(formatPageComment).join('\n')}`
      : '',
    snapshot.answers?.length
      ? `已有回答：\n${snapshot.answers.slice(0, 20).map(formatPageAnswer).join('\n\n')}`
      : '',
    snapshot.drafts?.length
      ? `用户当前未发布/正在编辑的草稿：\n${snapshot.drafts.slice(0, 12).map(formatPageDraft).join('\n\n')}`
      : '',
  ].filter(Boolean);
  return parts.join('\n\n').slice(0, 12000);
}

function inferContentType(pathname: string) {
  const path = pathname.replace(/\/+$/, '');
  if (/\/(?:questions|q)(?:\/|$)/.test(path)) return 'question';
  if (/\/(?:discussions|forum)(?:\/|$)|\/d\/[0-9]+(?:\/|$)/.test(path)) return 'discussion';
  if (/\/(?:dynamics|activity)(?:\/|$)|\/s\/[0-9]+(?:\/|$)/.test(path)) return 'dynamic';
  if (/\/announcements(?:\/|$)/.test(path)) return 'announcement';
  if (/\/(?:blog)(?:\/|$)|\/a\/[0-9]+(?:\/|$)/.test(path)) return 'blog';
  if (/\/books(?:\/|$)/.test(path)) return 'book';
  if (/\/tags(?:\/|$)/.test(path)) return 'tag';
  return 'page';
}

function pageContext(): RinChatContext {
  let snapshot: RinPageContextSnapshot | undefined;
  try {
    snapshot =
      window.__rinspaceBuildPageContext?.() || window.__rinspacePageContext;
  } catch (error) {
    console.error('RinAssistant page context failed', error);
    snapshot = window.__rinspacePageContext;
  }
  if (snapshot) {
    window.__rinspacePageContext = snapshot;
  }
  const structuredText = snapshot ? structuredPageText(snapshot) : '';
  return {
    url: window.location.href,
    title: snapshot?.title || document.title.replace(/\s+/g, ' ').trim(),
    selection: window.getSelection()?.toString().replace(/\s+/g, ' ').trim().slice(0, 2000) || '',
    excerpt: structuredText || textFromPage(),
    contentType: snapshot?.kind || inferContentType(window.location.pathname),
  };
}

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
}

function localMessagesKey(conversationId: number) {
  return `${localMessagesStoragePrefix}:${conversationId}`;
}

function localMessages(conversationId: number) {
  const key = localMessagesKey(conversationId);
  const raw = readLocalStorage(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(-localMessageLimit)
      .filter((item): item is RinChatMessage => {
        if (typeof item !== 'object' || item === null) return false;
        const record = item as Record<string, unknown>;
        return (
          typeof record.id === 'number' &&
          typeof record.senderUid === 'string' &&
          typeof record.body === 'string' &&
          typeof record.createdAt === 'string'
        );
      })
      .map((message) => ({
        ...message,
        body: message.body.slice(0, localMessageBodyLimit),
      }));
  } catch {
    removeLocalStorage(key);
    return [];
  }
}

function mergeMessages(left: RinChatMessage[], right: RinChatMessage[]) {
  const map = new Map<string, RinChatMessage>();
  for (const item of [...left, ...right]) {
    const key =
      item.id > 0
        ? `${item.conversationId}:${item.id}`
        : `optimistic:${item.senderUid}:${item.body}:${item.createdAt}`;
    map.set(key, item);
  }
  return Array.from(map.values())
    .sort((a, b) => {
      const timeDelta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (timeDelta !== 0) return timeDelta;
      return a.id - b.id;
    })
    .slice(-localMessageLimit);
}

function saveLocalMessages(conversationId: number, messages: RinChatMessage[]) {
  const key = localMessagesKey(conversationId);
  const persisted = messages
    .filter((message) => message.id > 0 && message.status !== 'sending')
    .slice(-localMessageLimit)
    .map((message) => ({
      ...message,
      body: message.body.slice(0, localMessageBodyLimit),
    }));
  if (!writeLocalStorage(key, JSON.stringify(persisted))) {
    removeLocalStorage(key);
  }
}

export default function RinAssistant() {
  const { t } = useTranslation('common');
  const [menuPoint, setMenuPoint] = useState<Point | null>(null);
  const [open, setOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [frame, setFrame] = useState<WindowFrame>(() => storedFrame());
  const [collectionFrame, setCollectionFrame] = useState<WindowFrame>(() => storedCollectionFrame());
  const [conversation, setConversation] = useState<RinChatConversation | null>(null);
  const [cachedMessages, setCachedMessages] = useState<RinChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [context, setContext] = useState<RinChatContext>(() => pageContext());
  const [webSearchMode, setWebSearchMode] = useState<RinWebSearchMode>('on');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [price, setPrice] = useState<RinChatPrice | null>(null);
  const sendingRef = useRef(false);
  const pendingSendRef = useRef<PendingRinSend | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const collectionDragRef = useRef<DragState | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const messages = useMemo(
    () => mergeMessages(cachedMessages, conversation?.messages || []),
    [cachedMessages, conversation],
  );
  const currentUserAvatar = useMemo(() => {
    const self = conversation?.participants.find((item) => item.uid !== 'rin');
    return self?.avatarUrl || '';
  }, [conversation]);
  const currentUser = useMemo(
    () => conversation?.participants.find((item) => item.uid !== 'rin') || null,
    [conversation],
  );

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 2 || shouldUseNativeContextMenu(event)) {
        setMenuPoint(null);
        return;
      }
      event.preventDefault();
      setMenuPoint({ x: event.clientX, y: event.clientY });
    };
    const closeMenu = () => {
      setMenuPoint(null);
    };
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('blur', closeMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('blur', closeMenu);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setMenuPoint(null);
      setFrame((current) => clampFrame(current));
      setCollectionFrame((current) => clampFrame(current));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    writeLocalStorage(frameStorageKey, JSON.stringify(frame));
  }, [frame]);

  useEffect(() => {
    writeLocalStorage(collectionFrameStorageKey, JSON.stringify(collectionFrame));
  }, [collectionFrame]);

  useEffect(() => {
    if (!open) return;
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [messages.length, busy, open]);

  useEffect(() => {
    if (!open) return undefined;
    const refreshContext = () => setContext(pageContext());
    window.addEventListener('rinspace:page-context', refreshContext);
    window.addEventListener('popstate', refreshContext);
    window.addEventListener('hashchange', refreshContext);
    return () => {
      window.removeEventListener('rinspace:page-context', refreshContext);
      window.removeEventListener('popstate', refreshContext);
      window.removeEventListener('hashchange', refreshContext);
    };
  }, [open]);

  useEffect(() => {
    if (!conversation) return;
    setCachedMessages((current) => {
      const local = localMessages(conversation.id).filter(
        (message) => message.id > 0 && message.status !== 'sending',
      );
      const next = mergeMessages(
        current.filter(
          (message) =>
            (message.id > 0 && message.status !== 'sending') || message.status === 'failed',
        ),
        conversation.messages,
      );
      const merged = mergeMessages(local, next);
      saveLocalMessages(conversation.id, merged);
      return merged;
    });
  }, [conversation]);

  const summon = () => {
    const nextContext = pageContext();
    setContext(nextContext);
    setMenuPoint(null);
    setOpen(true);
    setPrice(null);
    loadRinChatPrice()
      .then(setPrice)
      .catch((err: unknown) => setError(messageFromError(err, 'assistant.chatLoadFailed')));
    setFrame((current) =>
      clampFrame({
        ...current,
        x: menuPoint ? menuPoint.x : current.x,
        y: menuPoint ? menuPoint.y : current.y,
      }),
    );
    if (!conversation) {
      setBusy(true);
      setError('');
      loadRinChat()
        .then(setConversation)
        .catch((err: unknown) => setError(messageFromError(err, 'assistant.chatLoadFailed')))
        .finally(() => setBusy(false));
    }
  };

  const openCollectionWindow = () => {
    setMenuPoint(null);
    setCollectionOpen(true);
    setCollectionFrame((current) =>
      clampFrame({
        ...current,
        x: menuPoint ? menuPoint.x : current.x,
        y: menuPoint ? menuPoint.y : current.y,
      }),
    );
  };

  const startMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      frame,
    };
  };

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: 'resize',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      frame,
    };
  };

  const updateDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.type === 'move') {
      setFrame(clampFrame({ ...drag.frame, x: drag.frame.x + dx, y: drag.frame.y + dy }));
      return;
    }
    setFrame(
      clampFrame({
        ...drag.frame,
        width: drag.frame.width + dx,
        height: drag.frame.height + dy,
      }),
    );
  };

  const stopDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
  };

  const startCollectionMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    collectionDragRef.current = {
      type: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      frame: collectionFrame,
    };
  };

  const startCollectionResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    collectionDragRef.current = {
      type: 'resize',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      frame: collectionFrame,
    };
  };

  const updateCollectionDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = collectionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.type === 'move') {
      setCollectionFrame(clampFrame({ ...drag.frame, x: drag.frame.x + dx, y: drag.frame.y + dy }));
      return;
    }
    setCollectionFrame(
      clampFrame({
        ...drag.frame,
        width: drag.frame.width + dx,
        height: drag.frame.height + dy,
      }),
    );
  };

  const stopCollectionDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = collectionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    collectionDragRef.current = null;
  };

  const handleSendFailure = (pending: PendingRinSend, err: unknown) => {
    if (err instanceof ApiRequestError && err.status === 409) {
      pendingSendRef.current = null;
      setCachedMessages((current) => current.filter((message) => message.id !== pending.optimisticId));
      setDraft(pending.body);
      setPrice(null);
      loadRinChatPrice()
        .then(setPrice)
        .catch((priceError: unknown) => setError(messageFromError(priceError, 'assistant.chatLoadFailed')));
      setError(t('rinChat.priceUpdated'));
      return;
    }
    setCachedMessages((current) => current.map((message) =>
      message.id === pending.optimisticId ? { ...message, status: 'failed' } : message,
    ));
    setError(messageFromError(err, 'assistant.messageSendFailed'));
  };

  const submitMessage = () => {
    const body = draft.trim();
    if (!body || busy || sendingRef.current) return;
    if (!price || !price.enabled) {
      setError(t('rinChat.unavailable'));
      return;
    }
    if (pendingSendRef.current) {
      setError(t('rinChat.pending'));
      return;
    }
    sendingRef.current = true;
    const optimisticMessage: RinChatMessage = {
      id: -Date.now(),
      conversationId: conversation?.id || 0,
      senderUid: currentUser?.uid || 'me',
      senderUserId: currentUser?.userId || 'me',
      senderNickname: currentUser?.nickname || '我',
      senderAvatar: currentUser?.avatarUrl || '',
      body,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };
    const nextMessages = mergeMessages(messages, [optimisticMessage]);
    setCachedMessages((current) => mergeMessages(current, [optimisticMessage]));
    setDraft('');
    const nextContext = pageContext();
    setContext(nextContext);
    const pending: PendingRinSend = {
      body,
      context: nextContext,
      messages: nextMessages,
      webSearchMode,
      idempotencyKey: crypto.randomUUID(),
      policyVersion: price.policyVersion,
      priceSg: price.priceSg,
      optimisticId: optimisticMessage.id,
    };
    pendingSendRef.current = pending;
    setBusy(true);
    setError('');
    sendRinChatMessage(body, nextContext, nextMessages, webSearchMode, pending.idempotencyKey,
      pending.policyVersion, pending.priceSg)
      .then((nextConversation) => {
        pendingSendRef.current = null;
        setCachedMessages((current) =>
          current.filter((message) => message.id !== optimisticMessage.id),
        );
        setConversation(nextConversation);
      })
      .catch((err: unknown) => {
        handleSendFailure(pending, err);
      })
      .finally(() => {
        sendingRef.current = false;
        setBusy(false);
      });
  };

  const retryMessage = () => {
    const pending = pendingSendRef.current;
    if (!pending || busy || sendingRef.current) return;
    sendingRef.current = true;
    setCachedMessages((current) => current.map((message) =>
      message.id === pending.optimisticId ? { ...message, status: 'sending' } : message,
    ));
    setBusy(true);
    setError('');
    sendRinChatMessage(pending.body, pending.context, pending.messages,
      pending.webSearchMode, pending.idempotencyKey, pending.policyVersion, pending.priceSg)
      .then((nextConversation) => {
        pendingSendRef.current = null;
        setCachedMessages((current) => current.filter((message) => message.id !== pending.optimisticId));
        setConversation(nextConversation);
      })
      .catch((err: unknown) => {
        handleSendFailure(pending, err);
      })
      .finally(() => {
        sendingRef.current = false;
        setBusy(false);
      });
  };

  const discardFailedMessage = () => {
    const pending = pendingSendRef.current;
    if (!pending || busy) return;
    pendingSendRef.current = null;
    setCachedMessages((current) => current.filter((message) => message.id !== pending.optimisticId));
    setError('');
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    submitMessage();
  };

  return (
    <>
      <AnimateRadialMenu
        point={menuPoint}
        label={t('contextMenu.title')}
        hint={t('contextMenu.hint')}
        menuItems={[
          { id: 'rin', label: t('contextMenu.summon'), icon: <Icon name="stars" /> },
          { id: 'collections', label: t('collection.title'), icon: <Icon name="folder2-open" /> },
          { id: 'editor', label: t('contextMenu.editor'), icon: <Icon name="pencil-square" />,
            title: t('contextMenu.editorTitle'), href: publicEnv.localRealClient ? 'https://rinspace.com/editor/' : '/editor/' },
        ]}
        onClose={() => setMenuPoint(null)}
        onSelect={(item) => {
          if (item.id === 'rin') summon();
          if (item.id === 'collections') openCollectionWindow();
        }}
      />

      {collectionOpen ? (
        <section
          className="rin-collection-window"
          style={{
            left: collectionFrame.x,
            top: collectionFrame.y,
            width: collectionFrame.width,
            height: collectionFrame.height,
          }}
          aria-label="收藏夹"
        >
          <header
            className="rin-collection-header"
            onPointerDown={startCollectionMove}
            onPointerMove={updateCollectionDrag}
            onPointerUp={stopCollectionDrag}
            onPointerCancel={stopCollectionDrag}
          >
            <Icon name="folder2-open" />
            <div>
              <strong>收藏夹</strong>
              <span>Collection</span>
            </div>
            <AnimateButton unstyled
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setCollectionOpen(false);
              }}
              aria-label="关闭收藏夹"
            >
              <Icon name="x-lg" />
            </AnimateButton>
          </header>
          <div className="rin-collection-body">
            <CollectionFolderWorkspace active={collectionOpen} />
          </div>
          <AnimateButton unstyled
            type="button"
            className="rin-collection-resize"
            aria-label="调整收藏夹大小"
            onPointerDown={startCollectionResize}
            onPointerMove={updateCollectionDrag}
            onPointerUp={stopCollectionDrag}
            onPointerCancel={stopCollectionDrag}
          />
        </section>
      ) : null}

      {open ? (
        <section
          className="rin-assistant-window"
          style={{
            left: frame.x,
            top: frame.y,
            width: frame.width,
            height: frame.height,
          }}
          aria-label="琳"
        >
          <header
            className="rin-assistant-header"
            onPointerDown={startMove}
            onPointerMove={updateDrag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          >
            <img src={`${publicEnv.publicBasePath || ''}/assets/rin-avatar.png`} alt="" />
            <div>
              <strong>琳</strong>
              <span>Rin</span>
            </div>
            <AnimateButton unstyled
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
              }}
              aria-label="关闭"
            >
              <Icon name="x-lg" />
            </AnimateButton>
          </header>

          <div className="rin-assistant-context" title={context.title || context.url}>
            <Icon name="file-text" />
            <span>{context.title || 'Rinspace'}</span>
          </div>

          <div className="rin-assistant-messages" ref={messagesRef}>
            {messages.map((message: RinChatMessage) => {
              const fromRin = message.senderUid === 'rin';
              const avatar = fromRin
                ? message.senderAvatar || `${publicEnv.publicBasePath || ''}/assets/rin-avatar.png`
                : message.senderAvatar || currentUserAvatar;
              return (
                <article
                  className={`rin-assistant-message ${fromRin ? 'is-rin' : 'is-me'}`}
                  key={message.id}
                >
                  {fromRin ? <img src={avatar} alt="" /> : null}
                  {!fromRin && message.status === 'failed' ? (
                    <span className="rin-assistant-message-alert" title="发送失败">
                      !
                    </span>
                  ) : null}
                  <div>
                    <div className="rin-assistant-bubble">
                      <MathText text={message.body} />
                    </div>
                    <time>
                      {message.status === 'sending'
                        ? '发送中'
                        : message.status === 'failed'
                          ? '发送失败'
                          : messageTime(message.createdAt)}
                    </time>
                    {!fromRin && message.status === 'failed' && pendingSendRef.current?.optimisticId === message.id ? (
                      <span className="rin-assistant-message-retry">
                        <button type="button" onClick={retryMessage}>{t('actions.retry')}</button>
                        <button type="button" onClick={discardFailedMessage} title={t('rinChat.hideTitle')}>{t('rinChat.hide')}</button>
                      </span>
                    ) : null}
                  </div>
                  {!fromRin ? (
                    avatar ? (
                      <img src={avatar} alt="" />
                    ) : (
                      <span className="rin-assistant-avatar-fallback">
                        {(message.senderNickname || message.senderUserId || '我').slice(0, 1)}
                      </span>
                    )
                  ) : null}
                </article>
              );
            })}
            {busy ? (
              <article className="rin-assistant-message is-rin">
                <img src={`${publicEnv.publicBasePath || ''}/assets/rin-avatar.png`} alt="" />
                <div>
                  <div className="rin-assistant-bubble rin-assistant-typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </article>
            ) : null}
          </div>

          {error ? <div className="rin-assistant-error">{error}</div> : null}

          <form className="rin-assistant-compose" onSubmit={send}>
            <div className="rin-assistant-tools">
              <RinStickerPicker
                disabled={busy}
                onSelect={(sticker) =>
                  setDraft((current) => appendRinStickerToken(current, sticker.token))
                }
              />
              <AnimateButton unstyled
                type="button"
                className={`rin-assistant-web-toggle ${
                  webSearchMode === 'on' ? 'is-active' : ''
                }`}
                disabled={busy}
                title={webSearchMode === 'on' ? '本条消息强制联网检索' : '自动判断是否联网检索'}
                aria-pressed={webSearchMode === 'on'}
                aria-label={webSearchMode === 'on' ? '已开启联网检索' : '自动联网检索'}
                onClick={() =>
                  setWebSearchMode((current) => (current === 'on' ? 'auto' : 'on'))
                }
              >
                <Icon name="globe2" />
              </AnimateButton>
              <span className="rin-assistant-search-state">
                {webSearchMode === 'on' ? '联网' : '自动'}
              </span>
              {price?.mode === 'gateway' ? (
                <span className="rin-assistant-search-state" aria-live="polite">
                  {price.enabled ? (price.priceSg === 0 ? t('rinChat.freeTurn') : t('rinChat.pricedTurn', { amount: price.priceSg })) : t('rinChat.unavailableShort')}
                </span>
              ) : null}
            </div>
            <div className="rin-assistant-editor">
              <CodeMirrorEditor
                value={draft}
                minHeight="56px"
                placeholder="和琳说点什么"
                ariaLabel="和琳聊天"
                onSubmit={submitMessage}
                onChange={setDraft}
              />
            </div>
            <AnimateButton unstyled type="submit" disabled={!draft.trim() || busy || !price?.enabled} aria-label="发送">
              <Icon name="send-fill" />
            </AnimateButton>
          </form>

          <AnimateButton unstyled
            type="button"
            className="rin-assistant-resize"
            aria-label="调整大小"
            onPointerDown={startResize}
            onPointerMove={updateDrag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          />
        </section>
      ) : null}
    </>
  );
}
