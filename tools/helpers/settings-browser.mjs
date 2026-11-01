export async function openSettings(page, category) {
  const dialog = page.locator('.settings-dialog[open]');
  if (!await dialog.count()) {
    const review = page.locator('.lesson-overlay');
    const trigger = await review.isVisible() ? review.getByRole('button', { name: '设置', exact: true }) : page.locator('.site-header').getByRole('button', { name: '设置', exact: true });
    await trigger.click();
    await dialog.waitFor();
  }
  if (category) {
    const categories = dialog.getByRole('navigation', { name: '设置分类' });
    while (!await categories.isVisible()) await dialog.locator('.settings-mobile-back').click();
    await categories.locator(`[data-settings-category="${category}"]`).click();
  }
  return dialog;
}

export async function closeSettings(page) {
  const dialog = page.locator('.settings-dialog[open]');
  if (await dialog.count()) await dialog.getByRole('button', { name: '关闭设置', exact: true }).click();
}

export async function chooseTheme(page, value) {
  const labels = { lagoon: '蓝绿', pearl: '黑白', sky: '冰蓝', mint: '薄荷绿' };
  const dialog = await openSettings(page, 'appearance');
  await dialog.getByRole('group', { name: '界面配色' }).getByRole('button', { name: labels[value], exact: true }).click();
  await closeSettings(page);
}
