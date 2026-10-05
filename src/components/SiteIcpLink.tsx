import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { publicAsset, publicEnv } from '@/app/config/env';

const icpRecord = '\u6caaICP\u59072025152146\u53f7-2';
const policeRecord = '\u6caa\u516c\u7f51\u5b89\u590731012102000206\u53f7';

function SiteIcpLink() {
  const { t } = useTranslation('common');
  // The official registration icon is not part of the public source bundle.
  const policeIcon = publicEnv.localRealClient
    ? 'https://rinspace.com/assets/beian-mps.png'
    : publicAsset('/assets/beian-mps.png');
  return (
    <div className="site-icp-links">
      <div className="site-operator-line">
        <span>© 2026 {t('footer.company')}</span>
        <a href="mailto:lunifans@outlook.com">lunifans@outlook.com</a>
      </div>
      <nav className="site-legal-links" aria-label={t('footer.legalNav')}>
        <Link to="/legal">{t('footer.legal')}</Link>
        <Link to="/terms">{t('footer.terms')}</Link>
        <Link to="/privacy">{t('footer.privacy')}</Link>
        <Link to="/copyright">{t('footer.copyright')}</Link>
        <Link to="/contact">{t('footer.contact')}</Link>
      </nav>
      <a
        className="site-icp-link"
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noreferrer"
      >
        {icpRecord}
      </a>
      <a
        className="site-icp-link site-police-beian-link"
        href="https://beian.mps.gov.cn/#/query/webSearch?code=31012102000206"
        target="_blank"
        rel="noreferrer"
      >
        <img src={policeIcon} alt="" />
        <span>{policeRecord}</span>
      </a>
    </div>
  );
}

export default SiteIcpLink;
