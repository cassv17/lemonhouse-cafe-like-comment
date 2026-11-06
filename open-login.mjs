// 전용 프로필에 네이버 로그인 화면을 열고 사용자에게 넘긴다.
// 아이디·비밀번호는 입력하지 않는다. 사용자가 직접 로그인하고 '로그인 상태 유지'를 켜야 한다.
const fs = await import("node:fs/promises");
const DIR = decodeURIComponent(new URL(".", import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const cfg = JSON.parse((await fs.readFile(DIR + "config.json", "utf8")).replace(/^﻿/, ""));

const prof = (await profiles()).find((p) => p.id === cfg.profileId);
if (!prof) throw new Error(`ego lite에 '${cfg.profileId}' 프로필이 없습니다. setup-profile.ps1을 먼저 실행하세요`);

const name = (cfg.taskSpaceName || "cafe like-comment") + " 로그인";
const old = (await listTaskSpaces()).find((x) => x.name === name && x.createdBy === "agent");
const task = !old ? await taskSpace(name, { profileId: prof.id })
  : old.ownership === "agent" ? await taskSpace(old.id) : await takeOverTaskSpace(old.id);
const sp = (await listTaskSpaces()).find((x) => x.id === task.spaceId);
if (sp?.profileId !== prof.id) throw new Error(`작업 공간이 '${sp?.profileName}' 프로필에서 열렸습니다`);

await task.page("p1").goto("https://nid.naver.com/nidlogin.login?mode=form&url=https%3A%2F%2Fwww.naver.com", { timeout: 60000 });
console.log(`ego lite의 '${name}' 탭(프로필 ${prof.id})에 네이버 로그인 화면을 열었습니다.`);
console.log("→ 본인 네이버 계정으로 직접 로그인하세요. 반드시 '로그인 상태 유지'를 켜야 합니다.");
await task.handOff();
