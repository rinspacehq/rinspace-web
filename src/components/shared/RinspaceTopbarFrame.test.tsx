import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { AnimateButton } from "@/components/ui";

import { RinspacePhoneAuthDialog } from "./RinspaceTopbarFrame";

const labels = {
  title: "登录",
  close: "关闭",
  phone: "手机号",
  phonePlaceholder: "请输入手机号",
  code: "验证码",
  codePlaceholder: "请输入验证码",
  changePhone: "更换手机号",
  processing: "处理中",
  complete: "完成",
  sendCode: "发送验证码",
};

function Harness({ withChallenge = false }: { withChallenge?: boolean }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  return (
    <div>
      <AnimateButton unstyled type="button" onClick={() => setOpen(true)}>
        顶栏登录入口
      </AnimateButton>
      <RinspacePhoneAuthDialog
        open={open}
        busy={false}
        phone={phone}
        code={code}
        challenge={withChallenge}
        error=""
        status=""
        labels={labels}
        // A fresh handler identity on every render mirrors SiteTopbar, whose
        // inline closeAuthDialog is recreated on each render.
        onClose={() => setOpen(false)}
        onPhoneChange={setPhone}
        onCodeChange={setCode}
        onChangePhone={() => undefined}
        onSubmit={(event) => event.preventDefault()}
      />
    </div>
  );
}

describe("RinspacePhoneAuthDialog focus retention", () => {
  it("keeps the phone field focused while typing", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "顶栏登录入口" }));

    const phoneInput = screen.getByLabelText("手机号");
    await waitFor(() => expect(document.activeElement).toBe(phoneInput));

    let focusLost = 0;
    phoneInput.addEventListener("focusout", () => {
      focusLost += 1;
    });

    await user.type(phoneInput, "193351");

    expect((phoneInput as HTMLInputElement).value).toBe("193351");
    expect(focusLost).toBe(0);
    expect(document.activeElement).toBe(phoneInput);
  });

  it("keeps the code field focused while typing", async () => {
    const user = userEvent.setup();
    render(<Harness withChallenge />);
    await user.click(screen.getByRole("button", { name: "顶栏登录入口" }));

    const codeInput = screen.getByLabelText("验证码");
    await user.click(codeInput);

    let focusLost = 0;
    codeInput.addEventListener("focusout", () => {
      focusLost += 1;
    });

    await user.type(codeInput, "197124");

    expect((codeInput as HTMLInputElement).value).toBe("197124");
    expect(focusLost).toBe(0);
    expect(document.activeElement).toBe(codeInput);
  });

  it("returns focus to the opener when the dialog closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "顶栏登录入口" });
    await user.click(opener);

    const phoneInput = screen.getByLabelText("手机号");
    await waitFor(() => expect(document.activeElement).toBe(phoneInput));

    await user.keyboard("{Escape}");

    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(screen.queryByLabelText("手机号")).toBeNull();
  });
});
