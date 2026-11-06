// 로그인 점검 (읽기 전용: 좋아요·댓글을 올리지 않는다)
// - 전용 프로필에 네이버 로그인이 돼 있는지, 카페에서 보이는 닉네임이 무엇인지 확인한다.
// - config.json의 expectNick이 비어 있으면 지금 로그인된 닉네임을 등록한다(최초 설정). 이미 있으면 같은지 비교만 한다.
// 실행: .\run.ps1 -Mode check
const fs = await import("node:fs/promises");
const DIR = decodeURIComponent(new URL(".", import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const cfgPath = DIR + "config.json";
const cfg = JSON.parse((await fs.readFile(cfgPath, "utf8")).replace(/^﻿/, ""));
const CAFE = Number(cfg.cafeId || 19866392);

const prof = (await profiles()).find((p) => p.id === cfg.profileId);
if (!prof) throw new Error(`ego lite에 '${cfg.profileId}' 프로필이 없습니다. setup-profile.ps1을 먼저 실행하세요`);

const name = (cfg.taskSpaceName || "cafe like-comment") + " (check)";
const old = (await listTaskSpaces()).find((x) => x.name === name && x.createdBy === "agent");
const task = !old ? await taskSpace(name, { profileId: prof.id })
  : old.ownership === "agent" ? await taskSpace(old.id) : await takeOverTaskSpace(old.id);
const sp = (await listTaskSpaces()).find((x) => x.id === task.spaceId);
if (sp?.profileId !== prof.id) throw new Error(`작업 공간이 '${sp?.profileName}' 프로필에서 열렸습니다. config.json의 taskSpaceName을 바꿔 보세요`);
const page = task.page("p1");

// 1) 네이버 로그인 여부
let naverId = null;
for (let i = 0; i < 3 && !naverId; i++) {
  await page.goto("https://www.naver.com", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000 + i * 4000);
  naverId = await page.evaluate(() => (document.body.innerText.match(/([\w.-]+)@naver\.com/) || [])[1] || null).catch(() => null);
}
if (!naverId) {
  console.log("RESULT: NOT_LOGGED_IN — 전용 프로필에 네이버 로그인이 없습니다. 먼저 로그인 화면을 열어 직접 로그인하세요:");
  console.log("  powershell -ExecutionPolicy Bypass -File .\\setup-profile.ps1");
  await task.finish({ keep: [] });
} else {
  // 2) 카페에서 보이는 닉네임 (가장 최근 글의 댓글 입력창)
  await page.goto(`https://cafe.naver.com/f-e/cafes/${CAFE}/menus/0`, { timeout: 60000 });
  const r = await page.fetch(`https://apis.naver.com/cafe-web/cafe-boardlist-api/v1/cafes/${CAFE}/menus/0/articles?page=1&pageSize=5&sortBy=TIME&viewType=L`, { timeout: 20000 });
  const first = (JSON.parse(r.body).result?.articleList || []).find((x) => x.type === "ARTICLE")?.item;
  let nick = null;
  if (first) {
    await page.goto(`https://cafe.naver.com/f-e/cafes/${CAFE}/articles/${first.articleId}?boardtype=L&referrerAllArticles=true`, { timeout: 60000 });
    await page.waitForSelector('textarea[placeholder="댓글을 남겨보세요"]', { state: "visible", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);
    nick = await page.evaluate(() => document.getElementById("cafe_main")?.contentDocument?.querySelector(".comment_inbox_name")?.textContent.trim() || null);
  }
  console.log(`네이버 로그인: ${naverId}@naver.com`);
  if (!nick) {
    console.log("RESULT: NO_CAFE_NICK — 카페 댓글창을 찾지 못했습니다. 이 계정이 카페 회원인지, 댓글 권한이 있는지 확인하세요.");
  } else if (!cfg.expectNick) {
    cfg.expectNick = nick;
    if (!cfg.naverId) cfg.naverId = naverId;
    await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
    console.log(`RESULT: REGISTERED — 카페 닉네임 '${nick}'을(를) config.json에 등록했습니다. 이 닉네임이 아닌 계정으로 로그인돼 있으면 자동화가 멈춥니다.`);
  } else if (nick === cfg.expectNick) {
    console.log(`RESULT: OK — 카페 닉네임 '${nick}' (config.json과 일치)`);
  } else {
    console.log(`RESULT: WRONG_ACCOUNT — 지금 로그인된 닉네임은 '${nick}'인데 config.json에는 '${cfg.expectNick}'로 되어 있습니다. 계정을 바꾸려면 config.json의 expectNick을 비우고 다시 점검하세요.`);
  }
  await task.finish({ keep: [] });
}
