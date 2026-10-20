// End-to-end checks for the All In story (Twine 2 / SugarCube 2).
// Every passage is rendered and checked for broken links, dead ends,
// SugarCube errors and images that fail to load.
const { test, expect } = require('@playwright/test');
const path = require('path');

const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
// Passages SugarCube uses internally rather than as story screens
const SPECIAL = new Set(['StoryInit', 'PassageHeader', 'PassageFooter', 'HUDTemplate']);

async function loadGame(page) {
  await page.goto(GAME);
  await page.waitForFunction(() => window.SugarCube && SugarCube.State && SugarCube.State.passage);
}

async function storyGraph(page) {
  return page.evaluate(() =>
    SugarCube.Story.filter(() => true).map(p => ({
      title: p.title,
      links: [...p.text.matchAll(/\[\[(?:[^\]|]*?(?:->|\|))?([^\]]+?)\]\]/g)].map(m => m[1].trim()),
    })));
}

test('start screen loads with both entry points', async ({ page }) => {
  await loadGame(page);
  const story = page.locator('#passages');
  await expect(story.getByText('All In – A Gambler’s Experience')).toBeVisible();
  await expect(story.getByRole('link', { name: 'Choose a story' })).toBeVisible();
  await expect(story.getByRole('link', { name: 'How it works' })).toBeVisible();
});

test('every link points to a passage that exists', async ({ page }) => {
  await loadGame(page);
  const graph = await storyGraph(page);
  const names = new Set(graph.map(p => p.title));
  const broken = graph.flatMap(p => p.links.filter(l => !names.has(l)).map(l => `${p.title} -> ${l}`));
  expect(broken).toEqual([]);
});

test('no story passage is a dead end', async ({ page }) => {
  await loadGame(page);
  const graph = await storyGraph(page);
  const deadEnds = graph.filter(p => !SPECIAL.has(p.title) && p.links.length === 0).map(p => p.title);
  expect(deadEnds).toEqual([]);
});

test('every passage renders without errors or missing images', async ({ page }) => {
  await loadGame(page);
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const graph = await storyGraph(page);
  const problems = [];
  for (const { title } of graph.filter(p => !SPECIAL.has(p.title))) {
    await page.evaluate(t => SugarCube.Engine.play(t), title);
    // let images settle before checking them
    await page.waitForFunction(() => [...document.querySelectorAll('#passages img')].every(i => i.complete));
    const found = await page.evaluate(() => ({
      errors: [...document.querySelectorAll('#passages .error-view')].map(e => e.textContent.trim()),
      badImages: [...document.querySelectorAll('#passages img')].filter(i => i.naturalWidth === 0).map(i => i.getAttribute('src')),
    }));
    if (found.errors.length || found.badImages.length) problems.push({ passage: title, ...found });
  }
  expect(problems).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('a full Justyn playthrough reaches an ending', async ({ page }) => {
  await loadGame(page);
  const story = page.locator('#passages');
  await story.getByRole('link', { name: 'Choose a story' }).click();
  await story.locator('a.link-internal', { hasText: /Justyn/ }).first().click();
  // Take the first choice on each screen until the story loops back to the menus (max 30 steps)
  const visited = [];
  for (let step = 0; step < 30; step++) {
    visited.push(await page.evaluate(() => SugarCube.State.passage));
    const choices = story.locator('.choice-group a.link-internal'); // story choices, not the header nav
    if (await choices.count() === 0) break;
    const target = await choices.first().getAttribute('data-passage');
    if (['Start', 'ChooseCharacter', 'Resources', 'Info', 'Creators'].includes(target)) break; // reached an ending
    await choices.first().click();
  }
  expect(visited.length).toBeGreaterThan(3);
  expect(visited[visited.length - 1]).not.toBe('ChooseCharacter');
});
