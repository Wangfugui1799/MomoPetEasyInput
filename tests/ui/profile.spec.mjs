import {test,expect} from '@playwright/test';
test('voice and persona persist in both themes and restore defaults',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#settings-open').click();
  await page.locator('#pet-voice').selectOption('zh-CN-YunxiNeural');await page.locator('#pet-persona').selectOption('calm');
  await expect(page.locator('#pet-profile-status')).toContainText('已保存');
  await page.reload();await page.locator('[data-theme-choice="moonlight"]').click();await page.locator('#settings-open').click();
  await expect(page.locator('#settings-audio #pet-voice')).toHaveValue('zh-CN-YunxiNeural');await expect(page.locator('#pet-persona')).toHaveValue('calm');
  await page.locator('#pet-persona').selectOption('default');await page.locator('#pet-voice').selectOption('default');
  await page.keyboard.press('Escape');await page.locator('[data-theme-choice="classic"]').click();await page.locator('#settings-open').click();
  await expect(page.locator('#pet-voice')).toBeVisible();await expect(page.locator('#pet-persona')).toHaveValue('default');expect(errors).toEqual([]);
});
