import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button, Input, Select, Surface, Switch } from "components/ui";

import { useFeatureTranslation } from "@/i18n/useFeatureTranslation";
import {
  loadWalletAdminAgentPolicy,
  loadWalletAdminAgentUsage,
  updateWalletAdminAgentPolicy,
  WalletAdminError,
  type WalletAdminAgentPolicy,
  type WalletAdminAgentPolicyUpdate,
  type WalletAdminAgentUsage,
  type WalletAdminAgentUsageFilter,
} from "@/services/domains/walletAdmin";

type AgentPolicyDraft = Readonly<{
  enabled: boolean;
  model: "deepseek-flash";
  providerPriceVersion: string;
  providerInputCnyMicrosPerMillion: string;
  providerCachedInputCnyMicrosPerMillion: string;
  providerOutputCnyMicrosPerMillion: string;
  inputSgPerMillion: string;
  cachedInputSgPerMillion: string;
  outputSgPerMillion: string;
  maxIterations: string;
  maxOutputTokens: string;
  taskBudgetSg: string;
  dailyCallsLimit: string;
  dailyTokensLimit: string;
  dailySgLimit: string;
  sgCnyMicrosPerUnit: string;
}>;
type AgentPolicyTextField = Exclude<
  keyof AgentPolicyDraft,
  "enabled" | "model"
>;

const emptyDraft: AgentPolicyDraft = {
  enabled: false,
  model: "deepseek-flash",
  providerPriceVersion: "",
  providerInputCnyMicrosPerMillion: "0",
  providerCachedInputCnyMicrosPerMillion: "0",
  providerOutputCnyMicrosPerMillion: "0",
  inputSgPerMillion: "0",
  cachedInputSgPerMillion: "0",
  outputSgPerMillion: "0",
  maxIterations: "1",
  maxOutputTokens: "1",
  taskBudgetSg: "1",
  dailyCallsLimit: "1",
  dailyTokensLimit: "1",
  dailySgLimit: "1",
  sgCnyMicrosPerUnit: "0",
};

function policyDraft(policy: WalletAdminAgentPolicy): AgentPolicyDraft {
  return {
    enabled: policy.enabled,
    model: policy.model,
    providerPriceVersion: policy.providerPriceVersion,
    providerInputCnyMicrosPerMillion: policy.providerInputCnyMicrosPerMillion,
    providerCachedInputCnyMicrosPerMillion:
      policy.providerCachedInputCnyMicrosPerMillion,
    providerOutputCnyMicrosPerMillion: policy.providerOutputCnyMicrosPerMillion,
    inputSgPerMillion: policy.inputSgPerMillion,
    cachedInputSgPerMillion: policy.cachedInputSgPerMillion,
    outputSgPerMillion: policy.outputSgPerMillion,
    maxIterations: String(policy.maxIterations),
    maxOutputTokens: String(policy.maxOutputTokens),
    taskBudgetSg: policy.taskBudgetSg,
    dailyCallsLimit: String(policy.dailyCallsLimit),
    dailyTokensLimit: policy.dailyTokensLimit,
    dailySgLimit: policy.dailySgLimit,
    sgCnyMicrosPerUnit: policy.sgCnyMicrosPerUnit,
  };
}

function integer(raw: string): number {
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) throw new TypeError("invalid integer");
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new TypeError("unsafe integer");
  return parsed;
}

function localTime(raw: string): string | undefined {
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new TypeError("invalid time");
  return parsed.toISOString();
}

function formatMicros(raw: string | null): string {
  if (raw === null) return "—";
  const value = BigInt(raw);
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${value < 0n ? "−" : ""}¥${absolute / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
}

function PolicyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <Input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

export function RinAgentAdminPanel({
  uid,
  canConfigure,
}: {
  uid: string;
  canConfigure: boolean;
}) {
  const { t } = useFeatureTranslation("admin");
  const [policy, setPolicy] = useState<WalletAdminAgentPolicy | null>(null);
  const [draft, setDraft] = useState<AgentPolicyDraft>(emptyDraft);
  const [reason, setReason] = useState("");
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [usage, setUsage] = useState<readonly WalletAdminAgentUsage[]>([]);
  const [usageBusy, setUsageBusy] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [actorUid, setActorUid] = useState("");
  const [runId, setRunId] = useState("");
  const [usageState, setUsageState] = useState<
    "all" | "pending" | "settled" | "failed"
  >("all");
  const [usageModel, setUsageModel] = useState<"" | "deepseek-flash">("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const loadPolicy = useCallback(async () => {
    setPolicyBusy(true);
    setPolicyError("");
    try {
      const value = await loadWalletAdminAgentPolicy();
      setPolicy(value);
      setDraft(policyDraft(value));
    } catch {
      setPolicyError(t("agent.loadFailed"));
    } finally {
      setPolicyBusy(false);
    }
  }, [t]);

  const loadUsage = useCallback(
    async (filter: WalletAdminAgentUsageFilter = {}) => {
      setUsageBusy(true);
      setUsageError("");
      try {
        setUsage(await loadWalletAdminAgentUsage(filter));
      } catch {
        setUsageError(t("agent.auditLoadFailed"));
      } finally {
        setUsageBusy(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);
  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  const setDraftValue = (field: AgentPolicyTextField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!policy || !reason.trim() || policyBusy) return;
    setPolicyError("");
    let input: WalletAdminAgentPolicyUpdate;
    try {
      input = {
        expectedVersion: policy.version,
        enabled: draft.enabled,
        model: draft.model,
        providerPriceVersion: draft.providerPriceVersion,
        providerInputCnyMicrosPerMillion:
          draft.providerInputCnyMicrosPerMillion,
        providerCachedInputCnyMicrosPerMillion:
          draft.providerCachedInputCnyMicrosPerMillion,
        providerOutputCnyMicrosPerMillion:
          draft.providerOutputCnyMicrosPerMillion,
        inputSgPerMillion: draft.inputSgPerMillion,
        cachedInputSgPerMillion: draft.cachedInputSgPerMillion,
        outputSgPerMillion: draft.outputSgPerMillion,
        maxIterations: integer(draft.maxIterations),
        maxOutputTokens: integer(draft.maxOutputTokens),
        taskBudgetSg: draft.taskBudgetSg,
        dailyCallsLimit: integer(draft.dailyCallsLimit),
        dailyTokensLimit: draft.dailyTokensLimit,
        dailySgLimit: draft.dailySgLimit,
        sgCnyMicrosPerUnit: draft.sgCnyMicrosPerUnit,
        reason: reason.trim(),
      };
    } catch {
      setPolicyError(t("agent.invalid"));
      return;
    }
    setPolicyBusy(true);
    try {
      const value = await updateWalletAdminAgentPolicy(
        uid,
        crypto.randomUUID(),
        input,
      );
      setPolicy(value);
      setDraft(policyDraft(value));
      setReason("");
    } catch (error) {
      if (error instanceof WalletAdminError && error.code === "INVALID_REQUEST")
        setPolicyError(t("agent.invalid"));
      else {
        await loadPolicy();
        setPolicyError(t("agent.updateUnknown"));
      }
    } finally {
      setPolicyBusy(false);
    }
  };

  const filterUsage = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await loadUsage({
        actorUid: actorUid || undefined,
        runId: runId || undefined,
        model: usageModel || undefined,
        state: usageState,
        createdFrom: localTime(createdFrom),
        createdTo: localTime(createdTo),
        limit: 50,
      });
    } catch {
      setUsageError(t("agent.invalidFilter"));
    }
  };

  return (
    <Surface
      className="admin-wallet-policy admin-risk-section"
      id="wallet-risk-agent-policy"
    >
      <div className="admin-risk-section-heading">
        <h2>{t("agent.title")}</h2>
      </div>
      {policyError ? (
        <p role="alert" className="admin-refunds-error">
          {policyError}
        </p>
      ) : null}
      {policy ? (
        <>
          <dl>
            <div>
              <dt>{t("agent.state")}</dt>
              <dd>{t(policy.enabled ? "agent.enabled" : "agent.disabled")}</dd>
            </div>
            <div>
              <dt>{t("agent.model")}</dt>
              <dd>{policy.model}</dd>
            </div>
            <div>
              <dt>{t("agent.version")}</dt>
              <dd>{policy.version}</dd>
            </div>
            <div>
              <dt>{t("agent.providerPriceVersion")}</dt>
              <dd>{policy.providerPriceVersion}</dd>
            </div>
            <div>
              <dt>{t("agent.taskBudget")}</dt>
              <dd>{policy.taskBudgetSg} SG</dd>
            </div>
            <div>
              <dt>{t("agent.dailySg")}</dt>
              <dd>{policy.dailySgLimit} SG</dd>
            </div>
            <div>
              <dt>{t("agent.dailyTokens")}</dt>
              <dd>{policy.dailyTokensLimit}</dd>
            </div>
            <div>
              <dt>{t("agent.reason")}</dt>
              <dd>{policy.reason}</dd>
            </div>
          </dl>
          {canConfigure ? (
            <form
              className="admin-risk-policy-form admin-agent-policy-form"
              onSubmit={save}
            >
              <div className="admin-agent-switch">
                <Switch
                  label={t("agent.enable")}
                  checked={draft.enabled}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, enabled: checked }))
                  }
                />
              </div>
              <label>
                {t("agent.model")}
                <Input value={draft.model} readOnly />
              </label>
              <label>
                {t("agent.providerPriceVersion")}
                <Input
                  value={draft.providerPriceVersion}
                  maxLength={128}
                  onChange={(event) =>
                    setDraftValue(
                      "providerPriceVersion",
                      event.currentTarget.value,
                    )
                  }
                />
              </label>
              <PolicyInput
                label={t("agent.providerInputRate")}
                value={draft.providerInputCnyMicrosPerMillion}
                onChange={(value) =>
                  setDraftValue("providerInputCnyMicrosPerMillion", value)
                }
              />
              <PolicyInput
                label={t("agent.providerCachedRate")}
                value={draft.providerCachedInputCnyMicrosPerMillion}
                onChange={(value) =>
                  setDraftValue("providerCachedInputCnyMicrosPerMillion", value)
                }
              />
              <PolicyInput
                label={t("agent.providerOutputRate")}
                value={draft.providerOutputCnyMicrosPerMillion}
                onChange={(value) =>
                  setDraftValue("providerOutputCnyMicrosPerMillion", value)
                }
              />
              <PolicyInput
                label={t("agent.inputSgRate")}
                value={draft.inputSgPerMillion}
                onChange={(value) => setDraftValue("inputSgPerMillion", value)}
              />
              <PolicyInput
                label={t("agent.cachedSgRate")}
                value={draft.cachedInputSgPerMillion}
                onChange={(value) =>
                  setDraftValue("cachedInputSgPerMillion", value)
                }
              />
              <PolicyInput
                label={t("agent.outputSgRate")}
                value={draft.outputSgPerMillion}
                onChange={(value) => setDraftValue("outputSgPerMillion", value)}
              />
              <PolicyInput
                label={t("agent.maxIterations")}
                value={draft.maxIterations}
                onChange={(value) => setDraftValue("maxIterations", value)}
              />
              <PolicyInput
                label={t("agent.maxOutputTokens")}
                value={draft.maxOutputTokens}
                onChange={(value) => setDraftValue("maxOutputTokens", value)}
              />
              <PolicyInput
                label={t("agent.taskBudget")}
                value={draft.taskBudgetSg}
                onChange={(value) => setDraftValue("taskBudgetSg", value)}
              />
              <PolicyInput
                label={t("agent.dailyCalls")}
                value={draft.dailyCallsLimit}
                onChange={(value) => setDraftValue("dailyCallsLimit", value)}
              />
              <PolicyInput
                label={t("agent.dailyTokens")}
                value={draft.dailyTokensLimit}
                onChange={(value) => setDraftValue("dailyTokensLimit", value)}
              />
              <PolicyInput
                label={t("agent.dailySg")}
                value={draft.dailySgLimit}
                onChange={(value) => setDraftValue("dailySgLimit", value)}
              />
              <PolicyInput
                label={t("agent.sgCnyValue")}
                value={draft.sgCnyMicrosPerUnit}
                onChange={(value) => setDraftValue("sgCnyMicrosPerUnit", value)}
              />
              <label>
                {t("agent.changeReason")}
                <Input
                  value={reason}
                  maxLength={1000}
                  onChange={(event) => setReason(event.currentTarget.value)}
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                disabled={policyBusy || !reason.trim()}
              >
                {t("agent.save")}
              </Button>
            </form>
          ) : null}
        </>
      ) : policyBusy ? (
        <p role="status">{t("shared.loading")}</p>
      ) : null}

      <div className="admin-agent-audit-heading">
        <h3>{t("agent.auditTitle")}</h3>
      </div>
      <form className="admin-agent-audit-filter" onSubmit={filterUsage}>
        <label>
          {t("agent.actor")}
          <Input
            value={actorUid}
            maxLength={256}
            onChange={(event) => setActorUid(event.currentTarget.value)}
          />
        </label>
        <label>
          {t("agent.run")}
          <Input
            value={runId}
            maxLength={36}
            onChange={(event) =>
              setRunId(event.currentTarget.value.toLowerCase())
            }
          />
        </label>
        <label>
          {t("agent.auditState")}
          <Select
            value={usageState}
            onChange={(event) =>
              setUsageState(event.currentTarget.value as typeof usageState)
            }
          >
            <option value="all">{t("agent.all")}</option>
            <option value="pending">{t("agent.pending")}</option>
            <option value="settled">{t("agent.settled")}</option>
            <option value="failed">{t("agent.failed")}</option>
          </Select>
        </label>
        <label>
          {t("agent.model")}
          <Select
            value={usageModel}
            onChange={(event) =>
              setUsageModel(event.currentTarget.value as typeof usageModel)
            }
          >
            <option value="">{t("agent.all")}</option>
            <option value="deepseek-flash">deepseek-flash</option>
          </Select>
        </label>
        <label>
          {t("agent.from")}
          <Input
            type="datetime-local"
            value={createdFrom}
            onChange={(event) => setCreatedFrom(event.currentTarget.value)}
          />
        </label>
        <label>
          {t("agent.to")}
          <Input
            type="datetime-local"
            value={createdTo}
            onChange={(event) => setCreatedTo(event.currentTarget.value)}
          />
        </label>
        <Button type="submit" disabled={usageBusy}>
          {t("agent.filter")}
        </Button>
      </form>
      {usageError ? (
        <p role="alert" className="admin-refunds-error">
          {usageError}
        </p>
      ) : null}
      <div className="admin-rin-provider-table admin-agent-audit-table">
        <table aria-label={t("agent.auditTitle")}>
          <thead>
            <tr>
              <th>{t("agent.auditState")}</th>
              <th>{t("agent.identity")}</th>
              <th>{t("agent.tokens")}</th>
              <th>{t("agent.providerCost")}</th>
              <th>{t("agent.sgCharged")}</th>
              <th>{t("agent.revenueProfit")}</th>
              <th>{t("agent.receipt")}</th>
              <th>{t("agent.updated")}</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((item) => (
              <tr key={item.operationId}>
                <td>{t(`agent.states.${item.state}`)}</td>
                <td>
                  <strong>{item.actorUid}</strong>
                  <small>{item.projectId}</small>
                  <code>{item.runId}</code>
                </td>
                <td>
                  {item.inputTokens === null
                    ? "—"
                    : `${item.inputTokens} / ${item.cachedInputTokens} / ${item.outputTokens}`}
                </td>
                <td>{formatMicros(item.providerCostCnyMicros)}</td>
                <td>{item.goodnessChargedSg ?? "—"}</td>
                <td>
                  {formatMicros(item.goodnessRevenueCnyMicros)} /{" "}
                  {formatMicros(item.profitCnyMicros)}
                </td>
                <td>
                  <code>{item.providerRequestId || "—"}</code>
                </td>
                <td>{new Date(item.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
            {!usageBusy && usage.length === 0 ? (
              <tr>
                <td colSpan={8}>{t("agent.auditEmpty")}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
