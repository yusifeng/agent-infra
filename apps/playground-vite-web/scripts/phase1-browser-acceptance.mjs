import assert from 'node:assert/strict';

import { chromium } from 'playwright';

import { runWithPhase1Harness } from './phase1-harness.mjs';

const browserTimeoutMs = Number(
  process.env.PLAYGROUND_PHASE1_BROWSER_TIMEOUT_MS ?? process.env.PLAYGROUND_PHASE1_TIMEOUT_MS ?? 120000
);

function buildTurn(label) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const token = `${label}-${suffix}`.toUpperCase();
  return {
    prompt: `Reply with exactly ${token}`,
    token
  };
}

async function waitForThinkingToSettle(page) {
  await page.waitForFunction(() => !document.body.innerText.includes('Thinking...'), undefined, {
    timeout: 60000
  });
}

async function waitForVisibleText(page, text, timeout = 10000) {
  await page.waitForFunction(
    (expectedText) => document.body.innerText.includes(expectedText),
    text,
    {
      timeout
    }
  );
}

async function waitForMessageRoleText(page, role, text, timeout = 10000) {
  await page.waitForFunction(
    ([expectedRole, expectedText]) =>
      Array.from(document.querySelectorAll(`[data-message-role="${expectedRole}"]`)).some((element) =>
        element.textContent?.includes(expectedText)
      ),
    [role, text],
    {
      timeout
    }
  );
}

async function sendPrompt(page, prompt) {
  const textarea = page.getByRole('textbox');
  const sendButton = page.getByRole('button', { name: '发送消息' });

  await textarea.fill(prompt);
  await sendButton.click();
  await page.waitForURL(/\/chat\/[^/]+$/, { timeout: 10000 });
  const threadPath = new URL(page.url()).pathname;
  await waitForVisibleText(page, prompt, 10000);
  return threadPath;
}

await runWithPhase1Harness(
  async ({ viteBaseUrl }) => {
    let browser;

    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: {
          width: 1440,
          height: 1080
        }
      });

      await page.goto(`${viteBaseUrl}/new`, { waitUntil: 'networkidle' });

      const firstTurn = buildTurn('browser-thread-one');
      firstTurn.threadPath = await sendPrompt(page, firstTurn.prompt);
      await waitForMessageRoleText(page, 'assistant', firstTurn.token, 60000);
      await waitForThinkingToSettle(page);

      await page.reload({ waitUntil: 'networkidle' });
      await waitForVisibleText(page, firstTurn.prompt, 10000);
      await waitForMessageRoleText(page, 'assistant', firstTurn.token, 10000);
      assert.equal(new URL(page.url()).pathname, firstTurn.threadPath, 'refresh should preserve the active thread path');

      await page.getByRole('button', { name: '新聊天' }).click();
      await page.waitForURL(/\/new$/, { timeout: 10000 });

      const secondTurn = buildTurn('browser-thread-two');
      secondTurn.threadPath = await sendPrompt(page, secondTurn.prompt);
      await waitForMessageRoleText(page, 'assistant', secondTurn.token, 60000);
      await waitForThinkingToSettle(page);
      assert.notEqual(secondTurn.threadPath, firstTurn.threadPath, 'new chat should create a distinct thread');

      const threadButtons = page.getByRole('button', { name: 'New Thread' });
      await threadButtons.nth(1).waitFor({ state: 'visible', timeout: 10000 });
      assert.ok((await threadButtons.count()) >= 2, 'expected at least two sidebar thread entries');

      const firstThreadPathPattern = new RegExp(`${firstTurn.threadPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
      const secondThreadPathPattern = new RegExp(`${secondTurn.threadPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

      await threadButtons.nth(0).click();
      await page.waitForURL(firstThreadPathPattern, { timeout: 10000 });
      await waitForVisibleText(page, firstTurn.prompt, 10000);
      await waitForMessageRoleText(page, 'assistant', firstTurn.token, 10000);
      assert.equal(
        await page.evaluate((text) => document.body.innerText.includes(text), secondTurn.prompt),
        false,
        'switching back should hide second thread transcript'
      );

      await threadButtons.nth(1).click();
      await page.waitForURL(secondThreadPathPattern, { timeout: 10000 });
      await waitForVisibleText(page, secondTurn.prompt, 10000);
      await waitForMessageRoleText(page, 'assistant', secondTurn.token, 10000);
      assert.equal(
        await page.evaluate((text) => document.body.innerText.includes(text), firstTurn.prompt),
        false,
        'second thread should not show first transcript'
      );

      console.log(
        JSON.stringify(
          {
            ok: true,
            firstThreadPath: firstTurn.threadPath,
            secondThreadPath: secondTurn.threadPath
          },
          null,
          2
        )
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('Executable doesn\'t exist')) {
        throw new Error(
          `${error.message}\n\nRun: pnpm --filter playground-vite-web exec playwright install chromium`
        );
      }

      throw error;
    } finally {
      await browser?.close();
    }
  },
  {
    timeoutMs: browserTimeoutMs
  }
);
