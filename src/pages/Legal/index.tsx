import type { TFunction } from 'i18next';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';

import SiteIcpLink from '@/components/SiteIcpLink';
import SiteTopbar from '@/components/SiteTopbarShell';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';

const contactEmail = 'lunifans@outlook.com';

type LegalPageKey = 'about' | 'legal' | 'terms' | 'privacy' | 'copyright' | 'contact';

type LegalSectionKey =
  | 'position'
  | 'operator'
  | 'identity'
  | 'records'
  | 'links'
  | 'account'
  | 'knowledge'
  | 'enforcement'
  | 'collection'
  | 'purpose'
  | 'rights'
  | 'principles'
  | 'materials'
  | 'handling'
  | 'email';

const pageSections: Record<LegalPageKey, Array<{ key: LegalSectionKey; lines: number }>> = {
  about: [{ key: 'position', lines: 2 }, { key: 'operator', lines: 2 }],
  legal: [
    { key: 'identity', lines: 3 },
    { key: 'records', lines: 2 },
    { key: 'links', lines: 2 },
  ],
  terms: [
    { key: 'account', lines: 2 },
    { key: 'knowledge', lines: 2 },
    { key: 'enforcement', lines: 2 },
  ],
  privacy: [
    { key: 'collection', lines: 2 },
    { key: 'purpose', lines: 2 },
    { key: 'rights', lines: 1 },
  ],
  copyright: [
    { key: 'principles', lines: 2 },
    { key: 'materials', lines: 2 },
    { key: 'handling', lines: 1 },
  ],
  contact: [{ key: 'email', lines: 2 }, { key: 'handling', lines: 2 }],
};

const navItems: Array<{ key: LegalPageKey; path: string }> = [
  { key: 'about', path: '/about' },
  { key: 'legal', path: '/legal' },
  { key: 'terms', path: '/terms' },
  { key: 'privacy', path: '/privacy' },
  { key: 'copyright', path: '/copyright' },
  { key: 'contact', path: '/contact' },
];

function pageCopy(page: LegalPageKey, t: TFunction<'legal'>) {
  const interpolation = {
    company: t('common:footer.company'),
    email: contactEmail,
  };
  return {
    title: t(`pages.${page}.title`),
    label: t(`pages.${page}.label`),
    description: t(`pages.${page}.description`),
    sections: pageSections[page].map(({ key, lines }) => ({
      key,
      title: t(`pages.${page}.sections.${key}.title`),
      body: Array.from({ length: lines }, (_, index) =>
        t(`pages.${page}.sections.${key}.line${index + 1}`, interpolation),
      ),
    })),
  };
}

function LegalPage({ page }: { page: LegalPageKey }) {
  const { t } = useFeatureTranslation('legal');
  const current = pageCopy(page, t);
  const companyName = t('common:footer.company');

  return (
    <>
      <Helmet title={`${current.title} · ${t('navigation:brandName')}`}>
        <meta name="description" content={current.description} />
      </Helmet>
      <SiteTopbar />
      <main className="legal-page">
        <section className="legal-hero">
          <div className="detail-kicker">
            <span>{current.label}</span>
            <strong>Rinspace</strong>
          </div>
          <h1>{current.title}</h1>
          <p>{current.description}</p>
        </section>

        <section className="legal-layout">
          <article className="legal-document">
            {current.sections.map((section) => (
              <section key={section.key}>
                <h2>{section.title}</h2>
                {section.body.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </section>
            ))}
          </article>
          <aside className="legal-sidebar">
            <nav className="legal-nav" aria-label={t('navigation')}>
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  className={item.key === page ? 'active' : ''}
                  to={item.path}
                >
                  {t(`nav.${item.key}`)}
                </Link>
              ))}
            </nav>
            <section className="legal-contact-panel">
              <h2>{t('operator')}</h2>
              <p>{companyName}</p>
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </section>
            <SiteIcpLink />
          </aside>
        </section>
      </main>
    </>
  );
}

export default LegalPage;
