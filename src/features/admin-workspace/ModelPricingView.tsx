import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";

import { WalletPolicyPanel } from "./WalletPolicyPanel";

export function ModelPricingView({
  uid,
  canConfigure,
}: {
  uid: string;
  canConfigure: boolean;
}) {
  const { t } = useFeatureTranslation("admin");
  return (
    <main className="admin-refunds-view admin-model-pricing-view">
      <header className="admin-refunds-heading">
        <div>
          <h1>{t("pricing.title")}</h1>
          <p>{t("pricing.description")}</p>
        </div>
      </header>
      <WalletPolicyPanel uid={uid} canConfigure={canConfigure} />
    </main>
  );
}
