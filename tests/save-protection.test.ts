import {describe,it,expect} from "vitest";
import {createGame,buy,move} from "../src/engine/game";
import {pieceCopies} from "../src/engine/progression";
import {SaveStore,SAVE_KEY,BACKUP_KEY,RECOVERY_KEY,PRESERVED_KEY,decodeSave,type StoragePort,type PlaybackSave} from "../src/engine/persistence";
import {saveNoticeMarkup} from "../src/ui/save-notice";
import type {Game} from "../src/engine/types";

const OLD='{"schema":999,"rules":"future-version","note":"旧档原文\\n必须保留"}';
const BACKUP="既有备份原文\nB",RECOVERY="既有损坏原文\nC";
class MemoryStorage implements StoragePort{
 data=new Map<string,string>();failKey:string|null=null;dropKey:string|null=null;afterWrite?:(key:string)=>void;
 getItem(key:string){return this.data.get(key)??null;}
 setItem(key:string,value:string){if(key===this.failKey)throw Error("quota");if(key===this.dropKey)return;this.data.set(key,value);this.afterWrite?.(key);}
}
const playback:PlaybackSave={time:0,speed:2,paused:false};
function currentGame(phase:Game["phase"]="prepare"){
 const g=createGame(7801);expect(buy(g,g.players[0],0)).toBe(true);expect(move(g,g.players[0],g.players[0].pieces[0].uid,35)).toBe(true);g.players[0].locked=true;
 const left=structuredClone(g.players[0].pieces);
 if(phase==="result"||phase==="finished")g.history=[{combatVersion:g.combatVersion,round:1,opponentId:1,opponentName:g.players[1].name,kind:"pvp",winner:phase==="finished"?1:0,damage:phase==="finished"?100:1,income:5,hp:phase==="finished"?0:100,gold:g.players[0].gold,left,right:[]}];
 if(phase==="finished"){
  const p=g.players[0];for(const piece of p.pieces)g.pool[piece.defId]+=pieceCopies(piece);for(const id of p.shop)if(id)g.pool[id]++;
  p.pieces=[];p.shop=[];p.hp=0;p.eliminatedRound=1;
 }
 g.phase=phase;return g;
}
function setup(){
 const storage=new MemoryStorage();storage.setItem(SAVE_KEY,OLD);storage.setItem(BACKUP_KEY,BACKUP);storage.setItem(RECOVERY_KEY,RECOVERY);
 const store=new SaveStore(storage);expect(store.load().status).toBe("incompatible");return {storage,store,game:currentGame()};
}

describe("保留旧档并恢复当前进度保存",()=>{
 it("不兼容旧档默认保持只读，普通操作不能偷偷替换",()=>{
  const s=setup();expect(s.store.needsProtection).toBe(true);expect(s.store.save(s.game,playback)).toBe("incompatible");expect(s.storage.getItem(SAVE_KEY)).toBe(OLD);expect(s.storage.getItem(PRESERVED_KEY)).toBeNull();
 });
 it.each(["prepare","battle","result","finished"] as const)("%s保留原文后保存同一局，资源、禁用、阶段与播放状态保持",phase=>{
  const s=setup(),game=currentGame(phase),before=structuredClone(game),position={...playback,...(phase==="battle"?{time:12.5,paused:true}:{})};
  expect(s.store.protectAndSave(game,position)).toBe("saved");expect(s.store.needsProtection).toBe(false);expect(s.store.hasPreservedData).toBe(true);expect(game).toEqual(before);
  expect(JSON.parse(s.storage.getItem(PRESERVED_KEY)!).entries.map((e:{raw:string})=>e.raw)).toEqual([OLD]);expect(s.storage.getItem(BACKUP_KEY)).toBe(BACKUP);expect(s.storage.getItem(RECOVERY_KEY)).toBe(RECOVERY);
  const loaded=new SaveStore(s.storage).load();expect(loaded.status).toBe("saved");expect(loaded.data!.game).toEqual(before);expect(loaded.data!.playback).toEqual(position);
  game.message="恢复后继续操作";expect(s.store.save(game,position)).toBe("saved");expect(decodeSave(s.storage.getItem(SAVE_KEY)).data!.revision).toBe(2);
 });
 it("已有保留记录继续存在，追加原文而不覆盖它",()=>{
  const s=setup();s.storage.setItem(PRESERVED_KEY,JSON.stringify({schema:1,entries:[{savedAt:1,raw:"更早的原始档"}]}));expect(s.store.protectAndSave(s.game,playback)).toBe("saved");
  expect(JSON.parse(s.storage.getItem(PRESERVED_KEY)!).entries.map((e:{raw:string})=>e.raw)).toEqual(["更早的原始档",OLD]);
 });
 it("后续自动备份轮转后，当时的旧备份和损坏原文仍保留在归档中",()=>{
  const s=setup();expect(s.store.protectAndSave(s.game,playback)).toBe("saved");s.game.message="继续一条新进度";expect(s.store.save(s.game,playback)).toBe("saved");expect(s.storage.getItem(BACKUP_KEY)).not.toBe(BACKUP);
  const entry=JSON.parse(JSON.parse(s.store.exportOldSaves()!).preserved).entries[0];expect(entry).toMatchObject({raw:OLD,backup:BACKUP,recovery:RECOVERY});
 });
 it("旧格式保留条目补入缺失备份字段，已有字段不会被后来轮转的内容覆盖",()=>{
  const s=setup();s.storage.setItem(PRESERVED_KEY,JSON.stringify({schema:1,entries:[{savedAt:1,raw:OLD,backup:"最早已经保留的B"}]}));expect(s.store.protectAndSave(s.game,playback)).toBe("saved");const entry=JSON.parse(s.storage.getItem(PRESERVED_KEY)!).entries[0];expect(entry).toMatchObject({savedAt:1,raw:OLD,backup:"最早已经保留的B",recovery:RECOVERY});
 });
 it("当前局校验失败时不写任何旧档或主存档",()=>{
  const s=setup(),before=new Map(s.storage.data);s.game.pool[Object.keys(s.game.pool)[0]]++;expect(s.store.protectAndSave(s.game,playback)).toBe("damaged");expect(s.storage.data).toEqual(before);expect(s.store.needsProtection).toBe(true);
 });
 it("保留区写入失败时不碰主档，恢复存储后可重试",()=>{
  const s=setup();s.storage.failKey=PRESERVED_KEY;expect(s.store.protectAndSave(s.game,playback)).toBe("unavailable");expect(s.storage.getItem(SAVE_KEY)).toBe(OLD);expect(s.storage.getItem(BACKUP_KEY)).toBe(BACKUP);expect(s.storage.getItem(RECOVERY_KEY)).toBe(RECOVERY);expect(s.store.needsProtection).toBe(true);
  s.storage.failKey=null;expect(s.store.protectAndSave(s.game,playback)).toBe("saved");
 });
 it("保留成功但主档写入失败可重试，重复旧档不反复追加",()=>{
  const s=setup();s.storage.failKey=SAVE_KEY;expect(s.store.protectAndSave(s.game,playback)).toBe("unavailable");const preserved=s.storage.getItem(PRESERVED_KEY);expect(preserved).not.toBeNull();expect(s.storage.getItem(SAVE_KEY)).toBe(OLD);expect(s.store.needsProtection).toBe(true);
  s.storage.failKey=null;expect(s.store.protectAndSave(s.game,playback)).toBe("saved");expect(s.storage.getItem(PRESERVED_KEY)).toBe(preserved);
 });
 it.each([PRESERVED_KEY,SAVE_KEY])("%s静默丢弃写入也不能误报成功",key=>{
  const s=setup();s.storage.dropKey=key;expect(s.store.protectAndSave(s.game,playback)).toBe("unavailable");expect(s.storage.getItem(SAVE_KEY)).toBe(OLD);expect(s.store.needsProtection).toBe(true);
 });
 it.each(["非JSON旧保留区",'{"schema":2,"entries":[]}','{"schema":1,"entries":[{"savedAt":1,"raw":123}]}'])("未知或损坏保留区保持原文：%s",raw=>{
  const s=setup();s.storage.setItem(PRESERVED_KEY,raw);expect(s.store.protectAndSave(s.game,playback)).toBe("unavailable");expect(s.storage.getItem(PRESERVED_KEY)).toBe(raw);expect(s.storage.getItem(SAVE_KEY)).toBe(OLD);expect(JSON.parse(s.store.exportOldSaves()!).preserved).toBe(raw);
 });
 it("另一窗口先更新时不覆盖新进度",()=>{
  const s=setup();s.storage.setItem(SAVE_KEY,"另一窗口新档");expect(s.store.protectAndSave(s.game,playback)).toBe("conflict");expect(s.storage.getItem(SAVE_KEY)).toBe("另一窗口新档");expect(s.storage.getItem(PRESERVED_KEY)).toBeNull();
 });
 it("保留期间另一窗口更新，保留原文后停止替换主档",()=>{
  const s=setup();s.storage.afterWrite=key=>{if(key===PRESERVED_KEY)s.storage.data.set(SAVE_KEY,"另一窗口新档");};expect(s.store.protectAndSave(s.game,playback)).toBe("conflict");expect(s.storage.getItem(SAVE_KEY)).toBe("另一窗口新档");expect(JSON.parse(s.storage.getItem(PRESERVED_KEY)!).entries[0].raw).toBe(OLD);
 });
 it("导出包含不可读原文、保留区与既有备份，导出本身不改写",()=>{
  const s=setup(),before=new Map(s.storage.data),data=JSON.parse(s.store.exportOldSaves()!);expect(data).toMatchObject({format:"red-tides-old-saves",schema:1,primary:OLD,backup:BACKUP,recovery:RECOVERY});expect(s.storage.data).toEqual(before);
  s.store.protectAndSave(s.game,playback);const restored=new SaveStore(s.storage);restored.load();const exported=JSON.parse(restored.exportOldSaves()!);expect(restored.hasPreservedData).toBe(true);expect(exported.primary).toBeNull();expect(JSON.parse(exported.preserved).entries[0].raw).toBe(OLD);
 });
 it("正常存档没有旧档时不导出，存储不可用时明确失败",()=>{
  const storage=new MemoryStorage(),normal=new SaveStore(storage);normal.load();expect(normal.protectAndSave(currentGame(),playback)).toBe("saved");expect(storage.getItem(PRESERVED_KEY)).toBeNull();expect(normal.exportOldSaves()).toBeNull();const missing=new SaveStore(null);expect(missing.protectAndSave(currentGame(),playback)).toBe("unavailable");expect(missing.exportOldSaves()).toBeNull();
 });
 it("普通保存也验证实际写入，恢复后未变的有效检查点清除错误状态",()=>{
  const storage=new MemoryStorage(),store=new SaveStore(storage),game=currentGame();store.load();expect(store.save(game,playback)).toBe("saved");const message=game.message,raw=storage.getItem(SAVE_KEY);
  storage.dropKey=SAVE_KEY;game.message="尚未落盘的改动";expect(store.save(game,playback)).toBe("unavailable");expect(storage.getItem(SAVE_KEY)).toBe(raw);storage.dropKey=null;game.message=message;expect(store.save(game,playback)).toBe("saved");expect(storage.getItem(SAVE_KEY)).toBe(raw);
 });
});

describe("顶部存档恢复入口",()=>{
 it("不兼容状态即使没有通知，也提供保留与导出，不提供会丢失临时进度的刷新入口",()=>{
  const html=saveNoticeMarkup("",false,{status:"incompatible",needsProtection:true});expect(html).toContain("本局未保存");expect(html).toContain('data-action="protect-save"');expect(html).toContain('data-action="export-old-save"');expect(html).not.toContain('data-action="load"');
 });
 it("保留失败仍可重试保护，普通存储失败则重试保存，计算期间禁用写入操作",()=>{
  expect(saveNoticeMarkup("保留失败",false,{status:"unavailable",needsProtection:true})).toContain('data-action="protect-save"');const html=saveNoticeMarkup("",false,{status:"unavailable",busy:true});expect(html).toContain('data-action="retry-save" disabled');expect(html).not.toContain('data-action="load"');
 });
 it("保留成功后入口仍可导出；多窗口冲突只允许载入与只读导出",()=>{
  const preserved=saveNoticeMarkup("",false,{status:"saved",hasPreservedData:true});expect(preserved).toContain('data-action="export-old-save"');expect(preserved).not.toContain('data-action="protect-save"');const conflict=saveNoticeMarkup("",true,{status:"conflict",needsProtection:true,hasPreservedData:true});expect(conflict).toContain('data-action="load"');expect(conflict).toContain('data-action="export-old-save"');expect(conflict).not.toContain('data-action="protect-save"');expect(saveNoticeMarkup("",false,{status:"saved"})).toBe("");
 });
});
