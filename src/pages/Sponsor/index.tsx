import { AnimateButton, useNoticeToasts } from 'components/ui';
import { type FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Button, Container, Form } from '@/components/ui/compat';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import AvatarName from '@/components/AvatarName';
import LoadingState from '@/components/LoadingState';
import SiteIcpLink from '@/components/SiteIcpLink';
import SiteTopbar from '@/components/SiteTopbarShell';
import { messageFromError } from '@/services/errors';
import { loadCurrentUserInfo } from '@/services/domains/identity';
import type { CurrentUserInfo } from '@/services/contracts';
import {
  createSponsorOrder,
  createSponsorPagePay,
  loadSponsorOrder,
  loadSponsorSupporter,
  loadSponsorSupporters,
  type SponsorOrder,
  type SponsorSupporter,
} from '@/services/sponsor';

const presetAmounts = [1, 5, 10, 20, 50, 100];
const sponsorMaxCustomAmount = 10000;
const sponsorConfirmPollLimit = 8;
const sponsorConfirmPollIntervalMs = 2200;

type AmountSelection = number | 'custom' | null;

function useSponsorPageTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname]);
}

function formatDateTime(value: string | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function supporterAvatarName(supporter: SponsorSupporter) {
  return supporter.nickname.trim() || supporter.userId || 'Rinspace';
}

function sponsorAmountLabel(amountYuan: number) {
  return `${amountYuan} 元`;
}

function supporterAmountLabel(supporter: SponsorSupporter) {
  return supporter.amountText || supporter.amount || sponsorAmountLabelFromFen(supporter.amountFen);
}

function sponsorAmountLabelFromFen(amountFen: number) {
  if (!Number.isFinite(amountFen) || amountFen <= 0) return '';
  const yuan = amountFen / 100;
  return Number.isInteger(yuan) ? `${yuan} 元` : `${yuan.toFixed(2)} 元`;
}

function orderStatusLabel(status: string | undefined) {
  if (status === 'paid') return '已支付';
  if (status === 'pending') return '待支付';
  return status || '未知状态';
}

function userDisplayName(user: CurrentUserInfo | null) {
  return user?.display_name?.trim() || user?.username?.trim() || 'Rinspace 用户';
}

function userAvatarUrl(user: CurrentUserInfo | null) {
  return user?.avatar.custom || user?.avatar.gravatar || '';
}

function submitPayHtml(payHtml: string) {
  const nextDocument = window.open('', '_self');
  if (nextDocument) {
    nextDocument.document.open();
    nextDocument.document.write(payHtml);
    nextDocument.document.close();
    return;
  }
  document.open();
  document.write(payHtml);
  document.close();
}

function sponsorRecordPath(orderNo: string) {
  return `/sponsor/supporters/${encodeURIComponent(orderNo)}`;
}

function SponsorSupporterSkeleton() {
  return (
    <div className="sponsor-supporter-skeleton" aria-hidden="true">
      <span />
      <div>
        <strong />
        <em />
      </div>
      <b />
    </div>
  );
}

function SponsorSupporterRow({
  supporter,
  spacious = false,
}: {
  supporter: SponsorSupporter;
  spacious?: boolean;
}) {
  const message = supporter.message.trim();
  return (
    <Link
      className={`sponsor-supporter-row${spacious ? ' sponsor-supporter-row-spacious' : ''}`}
      to={sponsorRecordPath(supporter.orderNo)}
    >
      <span className="sponsor-supporter-person">
        <AvatarName
          name={supporterAvatarName(supporter)}
          imageUrl={supporter.avatarUrl}
          rank={supporter.rank}
          size={spacious ? 'md' : 'sm'}
        />
        {message ? <span className="sponsor-supporter-message">{message}</span> : null}
      </span>
      <span className="sponsor-supporter-meta">
        <strong>{supporterAmountLabel(supporter)}</strong>
        <span>{formatDateTime(supporter.paidAt)}</span>
      </span>
    </Link>
  );
}

function SponsorSupporterListPreview({
  supporters,
  loading,
  error,
}: {
  supporters: SponsorSupporter[];
  loading: boolean;
  error: string;
}) {
  return (
    <section className="panel sponsor-rules-panel">
      <div className="panel-heading">
        <Link className="sponsor-list-heading-link" to="/sponsor/supporters">
          赞助名单
        </Link>
        <strong>{loading ? '同步中' : supporters.length}</strong>
      </div>
      {loading ? (
        <div className="sponsor-supporter-list" aria-label="赞助名单加载中">
          <SponsorSupporterSkeleton />
          <SponsorSupporterSkeleton />
        </div>
      ) : null}
      {!loading && error ? <div className="state-strip">{error}</div> : null}
      {!loading && !error && !supporters.length ? (
        <div className="state-strip">暂时还没有公开赞助记录。</div>
      ) : null}
      {!loading && supporters.length ? (
        <div className="sponsor-supporter-list">
          {supporters.map((supporter) => (
            <SponsorSupporterRow supporter={supporter} key={supporter.orderNo} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SponsorPage() {
  useSponsorPageTop();
  const { t } = useTranslation('navigation');
  const [currentUser, setCurrentUser] = useState<CurrentUserInfo | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState('');
  const [supporters, setSupporters] = useState<SponsorSupporter[]>([]);
  const [supportersLoading, setSupportersLoading] = useState(true);
  const [supportersError, setSupportersError] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<AmountSelection>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  useNoticeToasts({
    userError, submitError,
  });
  const [order, setOrder] = useState<SponsorOrder | null>(null);

  const refreshCurrentUser = useCallback(async (isCancelled: () => boolean = () => false) => {
    setUserLoading(true);
    setUserError('');
    try {
      const result = await loadCurrentUserInfo();
      if (!isCancelled()) setCurrentUser(result);
    } catch (error) {
      if (!isCancelled()) {
        setCurrentUser(null);
        setUserError(messageFromError(error, 'sponsor.currentUserLoadFailed'));
      }
    } finally {
      if (!isCancelled()) setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refreshCurrentUser(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [refreshCurrentUser]);

  useEffect(() => {
    let cancelled = false;
    setSupportersLoading(true);
    setSupportersError('');
    void loadSponsorSupporters(24)
      .then((result) => {
        if (!cancelled) setSupporters(result.items);
      })
      .catch((error) => {
        if (!cancelled) {
          setSupporters([]);
          setSupportersError(messageFromError(error, 'sponsor.supportersLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setSupportersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const amountYuan = useMemo(() => {
    if (selectedAmount === null) return null;
    if (selectedAmount === 'custom') {
      const parsed = Number.parseInt(customAmount.trim(), 10);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= sponsorMaxCustomAmount) {
        return parsed;
      }
      return null;
    }
    return selectedAmount;
  }, [customAmount, selectedAmount]);

  const customAmountInvalid = selectedAmount === 'custom' && customAmount.trim() !== '' && amountYuan === null;
  const amountFen = amountYuan === null ? 0 : amountYuan * 100;
  const canSubmit = Boolean(currentUser) && amountYuan !== null && !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) {
      setSubmitError('请先登录后再赞助。');
      return;
    }
    if (amountYuan === null || amountYuan < 1 || amountYuan > sponsorMaxCustomAmount) {
      setSubmitError('赞助金额需要在 1 到 10000 元之间。');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const created = await createSponsorOrder({
        amountFen,
        message: message.trim(),
      });
      setOrder(created);
      const pay = await createSponsorPagePay(created.orderNo);
      setOrder(pay.order);
      submitPayHtml(pay.payHtml);
    } catch (error) {
      setSubmitError(messageFromError(error, 'sponsor.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Helmet title={`赞助 · ${t('brandName')}`}>
        <meta name="description" content="赞助 Rinspace" />
      </Helmet>
      <SiteTopbar onSessionChange={refreshCurrentUser} />
      <main className="sponsor-page">
        <Container>

          <section className="sponsor-layout">
            <article className="panel sponsor-form-panel">
              <div className="panel-heading">
                <span>赞助</span>
                {order ? <strong>{orderStatusLabel(order.status)}</strong> : null}
              </div>

              {userLoading ? <LoadingState variant="panel" label="加载赞助表单" /> : null}
              {!userLoading && !currentUser ? (
                <div className="state-strip">
                  请先登录后再发起赞助。登录后会自动记录你的昵称、头像和境界。
                </div>
              ) : null}
              {!userLoading && currentUser ? (
                <form className="sponsor-form" onSubmit={handleSubmit}>
                  <div className="sponsor-profile-line">
                    <AvatarName
                      name={userDisplayName(currentUser)}
                      imageUrl={userAvatarUrl(currentUser)}
                      rank={currentUser.rank}
                      size="md"
                    />
                  </div>

                  <div className="sponsor-amount-grid" role="radiogroup" aria-label="赞助金额">
                    {presetAmounts.map((amount) => (
                      <AnimateButton unstyled
                        key={amount}
                        type="button"
                        className={`sponsor-amount-chip${selectedAmount === amount ? ' active' : ''}`}
                        aria-pressed={selectedAmount === amount}
                        onClick={() => setSelectedAmount(amount)}
                      >
                        {sponsorAmountLabel(amount)}
                      </AnimateButton>
                    ))}
                    <AnimateButton unstyled
                      type="button"
                      className={`sponsor-amount-chip${selectedAmount === 'custom' ? ' active' : ''}`}
                      aria-pressed={selectedAmount === 'custom'}
                      onClick={() => setSelectedAmount('custom')}
                    >
                      自定义
                    </AnimateButton>
                  </div>

                  {selectedAmount === 'custom' ? (
                    <Form.Group className="sponsor-custom-amount" controlId="sponsor-custom-amount">
                      <Form.Label>自定义金额</Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        max={sponsorMaxCustomAmount}
                        value={customAmount}
                        onChange={(event) => setCustomAmount(event.target.value)}
                      />
                      {customAmountInvalid ? (
                        <span className="sponsor-field-note">金额需要在 1 到 10000 元之间。</span>
                      ) : null}
                    </Form.Group>
                  ) : null}

                  <Form.Group className="sponsor-message" controlId="sponsor-message">
                    <Form.Label>留言</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      maxLength={120}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                    />
                    <span className="sponsor-field-note">{message.length}/120</span>
                  </Form.Group>

                  <div className="sponsor-form-footer">
                    {amountYuan !== null ? (
                      <div className="sponsor-form-meta">
                        <span>合计</span>
                        <strong>{sponsorAmountLabel(amountYuan)}</strong>
                      </div>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                    <Button type="submit" variant="success" disabled={!canSubmit}>
                      {submitting ? (
                        <>
                          <LoadingState variant="inline" label="正在前往支付宝" />
                          正在前往支付宝
                        </>
                      ) : (
                        '确认并支付'
                      )}
                    </Button>
                  </div>
                </form>
              ) : null}
              {order ? (
                <div className="state-strip sponsor-order-strip">
                  订单 {order.orderNo} 已创建，支付完成后会回到这笔赞助记录。
                </div>
              ) : null}
            </article>

            <aside className="sponsor-side">
              <SponsorSupporterListPreview
                supporters={supporters}
                loading={supportersLoading}
                error={supportersError}
              />
              <SiteIcpLink />
            </aside>
          </section>
        </Container>
      </main>
    </>
  );
}

export function SponsorSupporterListPage() {
  useSponsorPageTop();
  const { t } = useTranslation('navigation');
  const [supporters, setSupporters] = useState<SponsorSupporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useNoticeToasts({ error });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadSponsorSupporters(500)
      .then((result) => {
        if (!cancelled) setSupporters(result.items);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setSupporters([]);
          setError(messageFromError(loadError, 'sponsor.supportersLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Helmet title={`赞助名单 · ${t('brandName')}`}>
        <meta name="description" content="Rinspace 赞助名单" />
      </Helmet>
      <SiteTopbar />
      <main className="sponsor-page sponsor-list-page">
        <Container>
          <section className="sponsor-single-layout sponsor-list-layout">
            <article className="panel sponsor-list-panel">
              <div className="panel-heading large">
                <span>赞助名单</span>
                <strong>{loading ? '同步中' : `${supporters.length} 笔`}</strong>
              </div>
              {loading ? (
                <div className="sponsor-supporter-list sponsor-supporter-list-full">
                  <SponsorSupporterSkeleton />
                  <SponsorSupporterSkeleton />
                  <SponsorSupporterSkeleton />
                </div>
              ) : null}
              {!loading && !error && !supporters.length ? (
                <div className="state-strip">暂时还没有公开赞助记录。</div>
              ) : null}
              {!loading && supporters.length ? (
                <div className="sponsor-supporter-list sponsor-supporter-list-full">
                  {supporters.map((supporter) => (
                    <SponsorSupporterRow supporter={supporter} spacious key={supporter.orderNo} />
                  ))}
                </div>
              ) : null}
            </article>
          </section>
        </Container>
      </main>
    </>
  );
}

export function SponsorSupporterPage() {
  useSponsorPageTop();
  const { t } = useTranslation('navigation');
  const { orderNo = '' } = useParams();
  const [supporter, setSupporter] = useState<SponsorSupporter | null>(null);
  const [pendingOrder, setPendingOrder] = useState<SponsorOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  useNoticeToasts({ error });

  useEffect(() => {
    const trimmedOrderNo = orderNo.trim();
    if (!trimmedOrderNo) {
      setLoading(false);
      setError('赞助记录不存在。');
      return undefined;
    }

    let cancelled = false;
    let retryTimer: number | undefined;
    let attempts = 0;

    async function loadDetail(quiet = false) {
      if (!quiet) {
        setLoading(true);
      }
      setError('');
      try {
        const publicRecord = await loadSponsorSupporter(trimmedOrderNo);
        if (cancelled) return;
        setSupporter(publicRecord);
        setPendingOrder(null);
        setChecking(false);
      } catch {
        try {
          const order = await loadSponsorOrder(trimmedOrderNo);
          if (cancelled) return;
          setPendingOrder(order);
          if (order.status === 'paid') {
            try {
              const publicRecord = await loadSponsorSupporter(trimmedOrderNo);
              if (cancelled) return;
              setSupporter(publicRecord);
              setPendingOrder(null);
              setChecking(false);
              return;
            } catch {
              setChecking(false);
              setError('支付已经确认，公开记录正在生成。');
              return;
            }
          }
          setSupporter(null);
          if (attempts < sponsorConfirmPollLimit) {
            attempts += 1;
            setChecking(true);
            retryTimer = window.setTimeout(() => {
              void loadDetail(true);
            }, sponsorConfirmPollIntervalMs);
          } else {
            setChecking(false);
          }
        } catch (privateError) {
          if (cancelled) return;
          const privateMessage = messageFromError(privateError, 'sponsor.recordLoadFailed');
          setSupporter(null);
          setPendingOrder(null);
          setChecking(false);
          setError(
            privateMessage === '请先登录。'
              ? '赞助记录不存在，或支付结果仍在确认。'
              : privateMessage,
          );
        }
      } finally {
        if (!quiet && !cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [orderNo]);

  const title = supporter ? `${supporterAvatarName(supporter)} 的赞助` : '赞助记录';

  return (
    <>
      <Helmet title={`${title} · ${t('brandName')}`}>
        <meta name="description" content={title} />
      </Helmet>
      <SiteTopbar />
      <main className="sponsor-page sponsor-detail-page">
        <Container>
          <section className="sponsor-single-layout sponsor-record-layout">
            <article className={`sponsor-superchat${supporter ? '' : ' sponsor-superchat-empty'}`}>
              {loading ? <LoadingState variant="panel" label="加载赞助记录" /> : null}
              {!loading && !error && pendingOrder ? (
                <div className="sponsor-superchat-body">
                  <div className="sponsor-superchat-status">支付确认</div>
                  <div className="sponsor-superchat-order">{pendingOrder.orderNo}</div>
                  <div className="state-strip">
                    {checking ? '正在确认支付结果。' : `订单状态：${orderStatusLabel(pendingOrder.status)}。`}
                  </div>
                </div>
              ) : null}
              {!loading && !error && supporter ? (
                <>
                  <div className="sponsor-superchat-amount">
                    <span>赞助</span>
                    <strong>{supporterAmountLabel(supporter)}</strong>
                  </div>
                  <div className="sponsor-superchat-body">
                    <div className="sponsor-superchat-head">
                      <AvatarName
                        name={supporterAvatarName(supporter)}
                        imageUrl={supporter.avatarUrl}
                        rank={supporter.rank}
                        size="md"
                      />
                      <time>{formatDateTime(supporter.paidAt)}</time>
                    </div>
                    {supporter.message.trim() ? (
                      <p className="sponsor-superchat-message">{supporter.message.trim()}</p>
                    ) : null}
                    <div className="sponsor-superchat-order">{supporter.orderNo}</div>
                  </div>
                </>
              ) : null}
            </article>
          </section>
        </Container>
      </main>
    </>
  );
}

export function SponsorAlipayReturnPage() {
  useSponsorPageTop();
  const { t } = useTranslation('navigation');
  const location = useLocation();
  const navigate = useNavigate();
  const orderNo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('out_trade_no') || params.get('orderNo') || '';
  }, [location.search]);

  useEffect(() => {
    if (!orderNo) return;
    navigate(sponsorRecordPath(orderNo), { replace: true });
  }, [navigate, orderNo]);

  return (
    <>
      <Helmet title={`赞助结果 · ${t('brandName')}`}>
        <meta name="description" content="赞助结果" />
      </Helmet>
      <SiteTopbar />
      <main className="sponsor-page sponsor-detail-page">
        <Container>
          <section className="sponsor-single-layout sponsor-record-layout">
            <article className="sponsor-superchat sponsor-superchat-empty">
              {orderNo ? (
                <LoadingState variant="panel" label="打开赞助记录" />
              ) : (
                <Alert className="notice error">未找到订单号。</Alert>
              )}
            </article>
          </section>
        </Container>
      </main>
    </>
  );
}

export default SponsorPage;
