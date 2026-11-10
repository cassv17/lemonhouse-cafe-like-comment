// 레몬하우스 네이버 카페 새 글에 좋아요 + 짧은 댓글 (ego lite 브라우저 자동화)
// 실행은 run.ps1로 한다: .\run.ps1 (실행) / -Mode dry (대상·문구만) / -Mode one -Article 12345 (한 글만) / -Mode check (로그인 점검)
// 옵션(전역): CAFE_MODE='dry' | CAFE_LIMIT=n(최대 처리 글 수) | CAFE_ONLY=[articleId,...]
// 규칙: 공지·내 글·댓글 막힌 글 제외 / 이미 좋아요·댓글한 글은 건너뜀 / 글 사이 20~30초 / 실패·보호조치·로그인 풀림이면 즉시 멈춤
const fs = await import("node:fs/promises");
// 이 파일이 있는 폴더 (어디에 내려받아도 동작)
const DIR = decodeURIComponent(new URL(".", import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const MODE = globalThis.CAFE_MODE === "dry" ? "dry" : "apply";
const LIMIT = globalThis.CAFE_LIMIT || 999;
const ONLY = globalThis.CAFE_ONLY ? new Set(globalThis.CAFE_ONLY.map(Number)) : null;
const kst = (d = new Date()) => d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const cfg = JSON.parse((await fs.readFile(DIR + "config.json", "utf8")).replace(/^﻿/, ""));
const CAFE = Number(cfg.cafeId || 19866392);
cfg.taskSpaceName = cfg.taskSpaceName || "cafe like-comment";
if (!cfg.profileId || !cfg.expectNick) throw new Error("config.json에 profileId·expectNick이 비어 있습니다. README의 최초 설정을 먼저 하세요");
const state = JSON.parse(await fs.readFile(DIR + "state.json", "utf8").catch(() => '{"lastRunAt":null,"done":{},"history":[]}'));
const report = { runAt: kst(), mode: MODE, status: "ok", liked: 0, commented: 0, skipped: [], items: [] };

// 고객 견적·상담 문의글(문의게시판, 비공개 글)은 직원이 답하는 곳이라 좋아요·댓글을 달지 않는다. config.json의 skipMenuPattern으로 바꿀 수 있다.
const SKIP_MENU = new RegExp(cfg.skipMenuPattern || "문의|상담|견적|A/S");

// ---------- 댓글 문구 ----------
const COLORS = /(다크우드|화이트우드|라이트우드|크림베이지|웜베이지|화이트|우드|베이지|아이보리|그레이|블랙|그린|네이비|모던)/;
function details(a) {
  const s = a.subject || "";
  const place = (s.match(/\[([^\]]+?)\s*(?:인테리어|리모델링)\]/) || [])[1];
  const py = (s.match(/(\d{2}\s*평대?)/) || [])[1]?.replace(/\s/g, "");
  const color = (s.match(COLORS) || [])[1];
  return { place, py, color };
}
function category(a) {
  const t = `${a.menuName} ${a.headName || ""} ${a.subject}`;
  if (/당첨|발표/.test(t)) return "winner";
  if (/구경하는\s?집/.test(t)) return "openhouse";
  if (/이벤트|캠페인/.test(t)) return "event";
  if (/월간|꿀팁|TIP|팁|AtoZ/i.test(t)) return "tip";
  if (/숏!?테리어/.test(t)) return "video";
  if (/마이하우스|후기/.test(t)) return "review";
  if (/공사중|리모델링/.test(t)) return "progress";
  if (/화이트|우드|베이지|아이보리|그레이|컬러|블랙|그린/.test(a.menuName)) return "gallery";
  return "done";
}
const POOL = {
  video: [
    "영상으로 보니 분위기가 더 잘 느껴지네요. 잘 보고 갑니다!",
    "짧은 영상인데 포인트가 다 담겨 있어요. 재밌게 봤습니다!",
    "전후 차이가 한눈에 보여서 좋네요. 영상 잘 봤어요~",
    "{py}인데 공간이 훨씬 넓어 보이네요. 영상 잘 봤습니다!",
    "{color} 톤이 영상에서 더 예쁘게 나오네요!",
    "구석구석 보여주셔서 집 구경 제대로 했어요. 감사합니다!",
  ],
  progress: [
    "{place} 현장 진행 상황 잘 봤습니다. 완공 모습도 기대돼요!",
    "공정별로 정리돼 있어서 보기 편하네요. 수고 많으십니다!",
    "차근차근 바뀌어 가는 과정이 신기하네요. 다음 소식도 기다릴게요!",
    "현장 사진이 자세해서 공사 흐름이 잘 보여요. 잘 보고 갑니다!",
    "{py} 리모델링 과정 궁금했는데 도움 됐어요. 완성본도 기대합니다!",
    "꼼꼼하게 진행되는 게 사진으로도 보이네요. 응원합니다!",
  ],
  done: [
    "{place} 집 정말 깔끔하게 완성됐네요. 잘 보고 갑니다!",
    "{py} 구성이 알차네요. 수납까지 꼼꼼하게 챙긴 게 보여요!",
    "전체적으로 톤이 차분해서 편안해 보여요. 사진 잘 봤습니다~",
    "조명이랑 마감이 깔끔해서 집이 환해 보이네요!",
    "공간마다 동선이 잘 짜여 있네요. 좋은 사례 감사합니다!",
    "{color} 톤으로 통일하니 집이 정돈돼 보여요. 잘 봤습니다!",
  ],
  gallery: [
    "{color} 톤 조합 예쁘네요. 참고하겠습니다!",
    "{color} 컬러가 공간을 훨씬 따뜻하게 만들어 주네요. 잘 봤어요!",
    "{py} 공간에 컬러 매치가 잘 어울려요. 저장해 둡니다!",
    "색감이 과하지 않고 은은해서 좋네요. 잘 보고 갑니다~",
    "가구랑 바닥 톤이 잘 맞아서 통일감 있어 보여요!",
    "사진만 봐도 아늑한 느낌이 나네요. 참고할게요!",
  ],
  review: [
    "후기 잘 읽었습니다. 새집에서 좋은 일만 가득하세요!",
    "직접 찍으신 사진이라 더 생생하네요. 집 너무 예뻐요!",
    "꼼꼼한 후기 감사합니다. 인테리어 준비하는 분들께 도움 많이 되겠어요!",
    "{place} 집 정말 예쁘게 완성됐네요. 좋은 후기 감사합니다~",
    "자랑하실 만하네요! 예쁜 집에서 즐거운 시간 보내세요",
    "정성 가득한 후기 잘 봤어요. 집이 정말 환하네요!",
  ],
  winner: [
    "당첨되신 분들 모두 축하드려요!",
    "축하드립니다~ 다음 이벤트도 기대할게요!",
    "좋은 소식 감사합니다. 당첨자분들 축하드려요!",
  ],
  openhouse: [
    "구경하는집 소식 반갑네요. 실제로 보면 더 좋을 것 같아요!",
    "직접 볼 수 있는 기회라 좋네요. 소식 감사합니다!",
    "구경하는집 사진만 봐도 기대돼요. 잘 보고 갑니다~",
  ],
  event: [
    "이벤트 소식 잘 봤습니다. 참여해 볼게요!",
    "좋은 이벤트 감사합니다. 잘 보고 갑니다!",
    "알찬 소식 감사해요. 다음 소식도 기다릴게요!",
  ],
  tip: [
    "이번 소식도 알차네요. 잘 보고 갑니다!",
    "유용한 정보 감사합니다. 참고해서 꾸며볼게요!",
    "몰랐던 내용이 많네요. 저장해 두고 볼게요~",
    "정리가 깔끔해서 보기 편해요. 감사합니다!",
  ],
};
const TAILS = ["", "", "", " :)", " ^^", " 👍"];
function makeComment(a) {
  const d = details(a);
  const recent = new Set(state.history.slice(-80));
  const ok = POOL[category(a)].filter((t) => [...t.matchAll(/\{(\w+)\}/g)].every((m) => d[m[1]]));
  const fill = (t) => t.replace(/\{(\w+)\}/g, (_, k) => d[k]);
  for (let i = 0; i < 30; i++) {
    const c = fill(pick(ok)) + pick(TAILS);
    if (!recent.has(c)) return c;
  }
  return fill(pick(ok)) + " " + pick(["감사합니다!", "잘 봤어요!", "응원합니다!"]);
}

// ---------- 공통 ----------
async function toast(title, msg) {
  const { spawnSync } = await import("node:child_process");
  spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", DIR + "notify.ps1", "-Title", title, "-Message", msg.slice(0, 250)], { timeout: 30000 });
}
async function save(final = true) {
  state.history = state.history.slice(-200);
  await fs.writeFile(DIR + "state.json", JSON.stringify(state, null, 1));
  await fs.writeFile(DIR + "last-report.json", JSON.stringify(report, null, 1));
  if (final) await fs.appendFile(DIR + "runs.log", `${report.runAt}\t${report.mode}\t${report.status}\tliked=${report.liked}\tcommented=${report.commented}\ttargets=${report.items.length}\n`);
}

// ---------- 1) 대상 글 ----------
const now = Date.now();
const since = Math.max(now - 7 * 864e5, Math.min(now - 864e5, state.lastRunAt ? Date.parse(state.lastRunAt) - 3600e3 : now - 864e5));
// 계정 충돌 방지: 네이버 로그인은 브라우저 프로필당 1계정이다. 이 작업은 config.json의 전용 프로필(profileId)에서만 돈다.
// 전용 프로필이 없으면 다른 프로필로 대신 돌지 않고 멈춘다. 프로필은 이름이 아니라 id(예: Profile 2)로 찾는다.
const prof = (await profiles()).find((p) => p.id === cfg.profileId);
if (!prof) {
  report.status = "PROFILE_MISSING";
  await save();
  await toast("카페 좋아요·댓글 중단", `ego lite에 '${cfg.profileId}' 프로필이 없습니다. setup-profile.ps1로 만들고 로그인하세요`);
  throw new Error("PROFILE_MISSING: " + cfg.profileId);
}
// profileId는 새 공간을 만들 때만 받으므로, 이미 있으면 id로 이어 쓰고 아래에서 프로필을 확인한다
const existing = (await listTaskSpaces()).find((x) => x.name === cfg.taskSpaceName && x.createdBy === "agent");
const task = !existing ? await taskSpace(cfg.taskSpaceName, { profileId: prof.id })
  : existing.ownership === "agent" ? await taskSpace(existing.id) : await takeOverTaskSpace(existing.id);
const mySpace = (await listTaskSpaces()).find((x) => x.id === task.spaceId);
if (mySpace?.profileId !== prof.id) {
  report.status = "WRONG_PROFILE";
  await save();
  await toast("카페 좋아요·댓글 중단", `작업 공간이 '${mySpace?.profileName}' 프로필에서 열렸습니다. config.json의 taskSpaceName을 바꾸세요`);
  throw new Error("WRONG_PROFILE: " + mySpace?.profileId);
}
const page = task.page("p1");
console.log("space", task.spaceId, "profile", prof.id, prof.name, "since", kst(new Date(since)));

// 예열: ego를 막 켠 직후엔 첫 페이지가 로그아웃처럼 보일 수 있다. 네이버 메인을 먼저 열어 세션을 살리고 로그인 아이디를 확인한다.
let naverLogin = false;
for (let i = 0; i < 3 && !naverLogin; i++) {
  await page.goto("https://www.naver.com", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000 + i * 5000);
  naverLogin = await page.evaluate((id) => (id && document.body.innerText.includes(id + "@naver.com")) || document.body.innerText.includes("로그아웃"), cfg.naverId).catch(() => false);
}
console.log("naver login", naverLogin);
await page.goto(`https://cafe.naver.com/f-e/cafes/${CAFE}/menus/0`, { timeout: 60000 });
const targets = [];
for (let p = 1; p <= 6; p++) {
  const r = await page.fetch(`https://apis.naver.com/cafe-web/cafe-boardlist-api/v1/cafes/${CAFE}/menus/0/articles?page=${p}&pageSize=50&sortBy=TIME&viewType=L`, { timeout: 20000 });
  if (!r.ok) throw new Error("목록 API " + r.status);
  const list = (JSON.parse(r.body).result?.articleList || []).filter((x) => x.type === "ARTICLE").map((x) => x.item);
  for (const a of list) {
    if (ONLY ? !ONLY.has(a.articleId) : a.writeDateTimestamp < since) continue;
    if (state.done[a.articleId]) continue;
    if (a.self) { report.skipped.push([a.articleId, "내 글"]); continue; }
    if (!a.enableComment || a.blindArticle) { report.skipped.push([a.articleId, "댓글 불가"]); continue; }
    if (a.openArticle === false || SKIP_MENU.test(a.menuName || "")) { report.skipped.push([a.articleId, "문의·비공개 글"]); continue; }
    targets.push(a);
  }
  if (!list.length || (!ONLY && list[list.length - 1].writeDateTimestamp < since)) break;
}
targets.sort((x, y) => x.writeDateTimestamp - y.writeDateTimestamp);
targets.splice(LIMIT);
console.log(`대상 ${targets.length}건`);

if (MODE === "dry") {
  for (const a of targets) {
    // 실제 실행과 같은 중복 확인(댓글 API에서 기대 닉네임 댓글이 있으면 댓글 생략)
    const api = await page.fetch(`https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${CAFE}/articles/${a.articleId}?query=&useCafeId=true&requestFrom=A`, { timeout: 20000 })
      .then((r) => (r.ok ? JSON.parse(r.body).result?.comments?.items || [] : null)).catch(() => null);
    const has = api?.some((c) => !c.isDeleted && c.writer?.nick === cfg.expectNick);
    console.log(a.articleId, `[${category(a)}]`, a.subject.slice(0, 30), "→", api == null ? "(댓글 확인 실패)" : has ? "(이미 댓글 있음 → 좋아요만)" : makeComment(a));
  }
  await task.finish({ keep: [] });
} else {

// ---------- 2) 좋아요 + 댓글 ----------
const TA = 'textarea[placeholder="댓글을 남겨보세요"]';
// "도배"(벽지)·"스팸" 같은 단어는 인테리어 글 본문에 흔해서 넣지 않는다. 네이버 차단 안내 문구만 본다.
const stopRe = /보호조치|일시적으로 제한|이용이 제한|자동입력 방지|자동등록방지|보안문자|captcha|비정상적인 (접근|활동|이용)|도배성|스팸성|연속(으로|해서) (등록|작성)/i;
const blockHit = (txt) => (txt || "").match(stopRe)?.[0];
const frameState = (T) => page.evaluate((T) => {
  const d = document.getElementById("cafe_main")?.contentDocument;
  if (!d) return { noFrame: true };
  const like = d.querySelector('.ReactionLikeIt a.u_likeit_list_btn[data-type="like"]');
  const me = d.querySelector(".comment_inbox_name")?.textContent.trim();
  const items = [...d.querySelectorAll("li.CommentItem")].map((li) => ({ nick: li.querySelector(".comment_nickname")?.textContent.trim(), text: li.querySelector(".text_comment")?.textContent.trim() }));
  return {
    liked: like ? like.getAttribute("aria-pressed") === "true" : null,
    me,
    mine: items.filter((i) => i.nick === me).length,
    posted: !!T && items.some((i) => i.nick === me && i.text === T),
    box: d.querySelector('textarea[placeholder="댓글을 남겨보세요"]')?.value || "",
    body: d.body.innerText.slice(0, 4000),
  };
}, T);

let stopped = null;
let apiFails = 0;
try {
  for (let k = 0; k < targets.length; k++) {
    const a = targets[k];
    const it = { id: a.articleId, subject: a.subject.slice(0, 40) };
    report.items.push(it);
    // 페이지가 늦게 뜨는 경우를 위해 최대 3번(점점 길게) 기다리고 새로고침한 뒤에야 로그인 풀림으로 판단한다
    let hasBox = false;
    for (let tryNo = 0; tryNo < 3 && !hasBox; tryNo++) {
      await page.goto(`https://cafe.naver.com/f-e/cafes/${CAFE}/articles/${a.articleId}?boardtype=L&referrerAllArticles=true`, { timeout: 60000 }).catch(() => {});
      await page.waitForLoadState().catch(() => {});
      hasBox = await page.waitForSelector(TA, { state: "visible", timeout: 20000 + tryNo * 10000 }).then(() => true).catch(() => false);
    }
    await page.waitForTimeout(1500);
    let s = await frameState("");
    if (!hasBox) {
      const top = await page.evaluate(() => document.body.innerText.slice(0, 3000));
      if (!naverLogin || /로그인|카페 가입하기|가입하기/.test((s.body || "") + top)) { stopped = "LOGIN_REQUIRED"; break; }
      it.result = "댓글창 없음"; stopped = "NO_COMMENT_BOX"; break;
    }
    if (blockHit(s.body)) { stopped = "BLOCKED: " + blockHit(s.body); break; }
    // 다른 계정으로 로그인돼 있으면 아무것도 하지 않고 멈춘다(다른 업무 계정으로 카페 활동 방지)
    if (s.me !== cfg.expectNick) { it.result = `로그인 계정 '${s.me}'`; stopped = `WRONG_ACCOUNT: ${s.me} (기대: ${cfg.expectNick})`; break; }

    // 댓글 목록(전체)을 먼저 읽는다. 읽을 수 없는 글은 좋아요도 누르지 않는다.
    const apiRes = await page.fetch(`https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${CAFE}/articles/${a.articleId}?query=&useCafeId=true&requestFrom=A`, { timeout: 20000 }).catch(() => null);
    if (apiRes && (apiRes.status === 401 || apiRes.status === 403)) {
      it.result = `열람 제한(${apiRes.status}) - 건너뜀`;
      state.done[a.articleId] = { at: kst(), skipped: "열람 제한" };
      await save(false);
      console.log(a.articleId, it.result);
      continue;
    }
    let api = null;
    try { if (apiRes?.ok) api = JSON.parse(apiRes.body).result?.comments?.items || []; } catch { api = null; }
    if (!api) {
      apiFails++;
      it.result = "댓글 목록 확인 실패";
      console.log(a.articleId, it.result, `(${apiFails}/3)`);
      if (apiFails >= 3) { stopped = "COMMENT_CHECK_FAILED"; break; }
      continue;
    }
    apiFails = 0;

    // 좋아요
    if (s.liked === false) {
      await page.click('loc=css:.ReactionLikeIt a.u_likeit_list_btn[data-type="like"]', { label: "like this article" });
      await page.waitForTimeout(1500);
      s = await frameState("");
      if (!s.liked) {
        await page.focus('loc=css:.ReactionLikeIt a.u_likeit_list_btn[data-type="like"]');
        await page.keyboard.press("Enter");
        await page.waitForTimeout(1500);
        s = await frameState("");
      }
      if (!s.liked) { it.result = "좋아요 실패"; stopped = "LIKE_FAILED"; break; }
      it.like = "새로"; report.liked++;
    } else it.like = s.liked ? "이미" : "버튼 없음";

    // 댓글: 화면 + 댓글 API(전체 댓글) 둘 다 보고, 내 닉네임 댓글이 하나라도 있으면 쓰지 않는다
    const mineApi = api.filter((c) => !c.isDeleted && c.writer?.nick === s.me).length;
    if (s.mine > 0 || mineApi > 0) it.comment = "이미 있음";
    else {
      let T = makeComment(a);
      const texts = new Set(api.map((c) => (c.content || "").trim()));
      for (let i = 0; i < 10 && texts.has(T); i++) T = makeComment(a);
      if (texts.has(T)) { it.result = "같은 문구 댓글 있음"; stopped = "DUPLICATE_TEXT"; break; }
      await page.waitForTimeout(rand(2000, 5000));
      await page.fill(TA, T);
      await page.waitForTimeout(800);
      s = await frameState(T);
      if (s.box !== T) { it.result = "입력 실패"; stopped = "FILL_FAILED"; break; }
      await page.focus("loc=role:button[name='등록']");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3500);
      s = await frameState(T);
      if (blockHit(s.body)) { stopped = "BLOCKED: " + blockHit(s.body); break; }
      if (!s.posted) { it.result = "등록 확인 안 됨"; stopped = "SUBMIT_FAILED"; break; }
      it.comment = T; report.commented++;
      state.history.push(T);
    }
    state.done[a.articleId] = { at: kst(), like: it.like, comment: it.comment };
    await save(false);
    console.log(a.articleId, "좋아요:", it.like, "| 댓글:", it.comment);
    if (k < targets.length - 1) await page.waitForTimeout(rand(20000, 30000));
  }
} catch (e) {
  stopped = "ERROR: " + e.message;
}

if (stopped) report.status = stopped;
else if (!ONLY && LIMIT === 999) state.lastRunAt = new Date(now).toISOString();
await save();
console.log(JSON.stringify(report, null, 1));

if (stopped === "LOGIN_REQUIRED") {
  await task.handOff();
  await toast("레몬하우스 카페 로그인 필요", "ego lite 전용 프로필에서 '로그인 상태 유지'를 켜고 네이버에 로그인한 뒤 run.ps1을 다시 실행하세요");
} else if (stopped) {
  await toast("카페 좋아요·댓글 중단", `${stopped.slice(0, 80)} / 좋아요 ${report.liked} · 댓글 ${report.commented} (last-report.json)`);
} else {
  if (report.liked || report.commented) await toast("카페 좋아요·댓글 완료", `새 글 ${targets.length}건: 좋아요 ${report.liked} · 댓글 ${report.commented}`);
  await task.finish({ keep: [] });
}
} // apply
