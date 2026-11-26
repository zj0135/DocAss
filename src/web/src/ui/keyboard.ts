export const editingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest('input,textarea,select,[contenteditable="true"]');
export const modalOpen = () =>
  !!document.querySelector(
    '[role="dialog"][aria-modal="true"], [aria-label="PDF 密码"], [aria-label="关闭前保存"]',
  );
