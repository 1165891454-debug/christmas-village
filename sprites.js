/* sprites.js — Stage 3：程序化像素角色（Charles / Julie / NPC）
 * 全部用 Canvas 矩形绘制，无外部图片资源。
 * 造型基准 design-assets/charles-julie-design-v2.png：
 *   Charles：短发、黑框眼镜（标志性）、瘦削、稍高
 *   Julie：年轻、及腰长直发+刘海、女生轮廓明显、冬季白绒帽
 * 新增：待机呼吸动画（传入 t）、更自然的行走/挥手、情侣感细节（腮红、身高差、呼应配色）。
 */
window.Sprites = (function () {
  'use strict';
  var U = 2; // 每个艺术像素 = 2 屏幕像素

  function r(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w * U), Math.round(h * U));
  }

  // 服装配色表（Charles 与 Julie 同名服装有呼应的情侣色）
  var OUTFITS = {
    winter: {
      m: { top: '#3b5a80', trim: '#e8dcc0', legs: '#3c4658', boots: '#5b3d29', scarf: '#e8dcc0', hat: null },
      f: { top: '#c86b7e', trim: '#f4ead8', legs: '#8a5a68', boots: '#6b4a2f', scarf: '#f4ead8', hat: 'beanie' }
    },
    santa: {
      m: { top: '#c0392b', trim: '#ffffff', legs: '#c0392b', boots: '#3a2c22', scarf: null, hat: 'santa' },
      f: { top: '#c0392b', trim: '#ffffff', legs: '#a83226', boots: '#3a2c22', scarf: null, hat: 'santa' }
    },
    home: {
      m: { top: '#5a7a8c', trim: '#4a6a7c', legs: '#4a6a7c', boots: '#8a9aa8', scarf: null, hat: null },
      f: { top: '#b784a9', trim: '#d9b9cf', legs: '#a06f94', boots: '#c9a5b8', scarf: null, hat: null }
    },
    /* v4.6.0：cli 渲染层（chars.js 缺失时的兜底）也认得新衣服，
       保证「没有 chars.js 的极端情况」下不会所有人的颜色都一样。 */
    spring: {
      m: { top: '#7fb8a4', trim: '#fbf6ea', legs: '#6f8f7c', boots: '#9a7a55', scarf: '#f7e9d2', hat: null },
      f: { top: '#e8a0b4', trim: '#fff7ef', legs: '#c98fa4', boots: '#b08a68', scarf: '#fff7ef', hat: 'beanie' }
    },
    rain: {
      m: { top: '#33506e', trim: '#d8c27a', legs: '#2a3446', boots: '#232a33', scarf: '#d8c27a', hat: null },
      f: { top: '#4a4a7a', trim: '#e6d49a', legs: '#34345a', boots: '#2a2a3a', scarf: '#e6d49a', hat: 'beanie' }
    },
    snow: {
      m: { top: '#c2553a', trim: '#fbf3e6', legs: '#4a4238', boots: '#5a4632', scarf: '#fbf3e6', hat: null },
      f: { top: '#c2506a', trim: '#fdf5ec', legs: '#5a4048', boots: '#6a5038', scarf: '#fdf5ec', hat: 'beanie' }
    },
    carpenter: {
      m: { top: '#8a6a45', trim: '#d9c6a8', legs: '#5f5344', boots: '#4a3a2a', scarf: '#c9a86f', hat: null },
      f: { top: '#a87c52', trim: '#e6d5bb', legs: '#6d5c48', boots: '#5a4632', scarf: '#e6d5bb', hat: 'beanie' }
    },
    party: {
      m: { top: '#2a2a3a', trim: '#f0c040', legs: '#1f1f2b', boots: '#14141a', scarf: '#f0c040', hat: null },
      f: { top: '#8a2a48', trim: '#f0c040', legs: '#5c1a2f', boots: '#2a1a20', scarf: '#f0c040', hat: 'beanie' }
    },
    iceland: {
      m: { top: '#1f4a4a', trim: '#cfe9e0', legs: '#22383c', boots: '#1a2628', scarf: '#6fe3c4', hat: null },
      f: { top: '#3a2f5a', trim: '#d8e9e2', legs: '#2c2444', boots: '#241d33', scarf: '#d8e9e2', hat: 'beanie' }
    }
  };

  /* 主角色绘制 —— 交给 chars.js 的矢量精灵（高分辨率烘焙 + drawImage）
   * 用法、签名与旧版完全一致，外部调用无需改动：
   *   ctx, cx/cy = 脚底中心（世界坐标）, dir 0下/1上/2左/3右, frame 0-3
   *   o = { gender:'m'|'f', glasses, hairStyle, outfit }
   *   wave = 是否挥手, t = 时间戳 ms
   * chars.js 缺失时退化为简洁的胶囊形人物，保证游戏不崩。
   */
  function drawCharacter(ctx, cx, cy, dir, frame, o, wave, t) {
    if (window.Chars) {
      window.Chars.draw(ctx, cx, cy, dir, frame, o, wave, t);
      return;
    }
    // —— 兜底：极简剪影（正常情况下不会走到这里）——
    var isM = o.gender === 'm';
    var h = isM ? 62 : 60;
    var top = cy - h;
    ctx.save();
    ctx.fillStyle = 'rgba(64,84,120,.2)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 1.5, 12, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isM ? '#3d5c82' : '#c66470';
    ctx.beginPath(); ctx.roundRect(cx - 9, top + 18, 18, 30, 7); ctx.fill();
    ctx.fillStyle = '#f4cba6';
    ctx.beginPath(); ctx.arc(cx, top + 11, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isM ? '#2c221c' : '#4b3225';
    ctx.beginPath(); ctx.arc(cx, top + 8, 10.4, Math.PI, 0); ctx.fill();
    ctx.restore();
  }

  /* ---------- NPC ---------- */

  function drawSanta(ctx, cx, cy, t) {
    if (window.Chars && window.Chars.drawSanta) { window.Chars.drawSanta(ctx, cx, cy, t); return; }
    var bob = Math.sin(t / 600) > 0 ? 0 : 1;
    var x0 = cx - 9 * U, y0 = cy - 30 * U - bob;
    r(ctx, x0 + 4 * U, y0 + 20 * U, 3 * U, 8 * U, '#8c2d22');
    r(ctx, x0 + 11 * U, y0 + 20 * U, 3 * U, 8 * U, '#8c2d22');
    r(ctx, x0 + 3 * U, y0 + 10 * U, 12 * U, 11 * U, '#c0392b');
    r(ctx, x0 + 3 * U, y0 + 18 * U, 12 * U, 1.6 * U, '#3a2c22');      // 腰带
    r(ctx, x0 + 7.8 * U, y0 + 18 * U, 2.4 * U, 1.6 * U, '#f0c040');
    r(ctx, x0 + 2 * U, y0 + 11 * U, 1.8 * U, 8 * U, '#c0392b');
    r(ctx, x0 + 14.2 * U, y0 + 11 * U, 1.8 * U, 8 * U, '#c0392b');
    r(ctx, x0 + 4 * U, y0 + 3 * U, 10 * U, 7 * U, '#f6cfa8');
    r(ctx, x0 + 3.4 * U, y0 + 1.4 * U, 1.2 * U, 1.2 * U, '#e8a0a0');  // 红脸蛋
    r(ctx, x0 + 13.4 * U, y0 + 1.4 * U, 1.2 * U, 1.2 * U, '#e8a0a0');
    r(ctx, x0 + 4.4 * U, y0 + 8 * U, 9.2 * U, 5.4 * U, '#f2f2f2');    // 胡子
    r(ctx, x0 + 5.6 * U, y0 + 12.6 * U, 6.8 * U, 1.6 * U, '#f2f2f2'); // 胡子尖
    r(ctx, x0 + 5.2 * U, y0 + 1.4 * U, 1.2 * U, 1.2 * U, '#2b2119');
    r(ctx, x0 + 11.6 * U, y0 + 1.4 * U, 1.2 * U, 1.2 * U, '#2b2119');
    r(ctx, x0 + 3.4 * U, y0 - 1 * U, 11.2 * U, 1.8 * U, '#ffffff');
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo((x0 + 3.4) * U, (y0 - 0.6) * U);
    ctx.lineTo((x0 + 14.6) * U, (y0 - 0.6) * U);
    ctx.lineTo((x0 + 9) * U, (y0 - 6.5) * U);
    ctx.closePath(); ctx.fill();
    r(ctx, x0 + 7.8 * U, y0 - 7.4 * U, 2.2 * U, 2.2 * U, '#ffffff');
    // 麻袋礼物
    r(ctx, x0 + 15.4 * U, y0 + 16 * U, 4 * U, 4.6 * U, '#a87b48');
    r(ctx, x0 + 16.6 * U, y0 + 14.6 * U, 1.6 * U, 1.6 * U, '#f0c040');
  }

  function drawSnowman(ctx, cx, cy, t) {
    var bob = Math.sin(t / 700) > 0 ? 0 : 1;
    var x0 = cx - 8 * U, y0 = cy - 26 * U - bob;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy - 5 * U, 8 * U, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy - 16 * U, 6 * U, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy - 24 * U, 4.6 * U, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(190,208,235,.4)';
    ctx.beginPath(); ctx.ellipse(cx, cy - 2 * U, 8 * U, 2.4 * U, 0, 0, 7); ctx.fill();
    // 旧礼帽
    r(ctx, x0 + 4.4 * U, y0 - 6.4 * U, 7.2 * U, 1.2 * U, '#2e333d');
    r(ctx, x0 + 5.8 * U, y0 - 11.4 * U, 4.4 * U, 5 * U, '#2e333d');
    r(ctx, x0 + 5.8 * U, y0 - 8 * U, 4.4 * U, 1.2 * U, '#c0392b');
    r(ctx, x0 + 1 * U, y0 + 9 * U, 14 * U, 1.6 * U, '#c0392b');
    r(ctx, x0 + 6.5 * U, y0 + 10 * U, 2.4 * U, 4 * U, '#c0392b');
    r(ctx, cx - 1.2 * U, cy - 24.5 * U, 2.6 * U, 1 * U, '#e8934a');
    r(ctx, cx - 2.6 * U, cy - 26.5 * U, 1.1 * U, 1.1 * U, '#2b2119');
    r(ctx, cx + 1.5 * U, cy - 26.5 * U, 1.1 * U, 1.1 * U, '#2b2119');
    ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = U;
    ctx.beginPath(); ctx.moveTo(cx - 6 * U, cy - 15 * U); ctx.lineTo(cx - 12 * U, cy - 20 * U); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 6 * U, cy - 15 * U); ctx.lineTo(cx + 12 * U, cy - 20 * U); ctx.stroke();
  }

  function drawElf(ctx, cx, cy, t, frame) {
    if (window.Chars && window.Chars.drawElf) { window.Chars.drawElf(ctx, cx, cy, t, frame); return; }
    var x0 = cx - 8 * U, y0 = cy - 28 * U;
    var step = (frame === 1) ? 1 : (frame === 3 ? -1 : 0);
    r(ctx, x0 + 5 * U, y0 + 22 * U + step * U, 2.5 * U, 6 * U, '#3f6b3f');
    r(ctx, x0 + 8.5 * U, y0 + 22 * U - step * U, 2.5 * U, 6 * U, '#3f6b3f');
    // 卷翘鞋尖
    r(ctx, x0 + 4.2 * U, y0 + 27.4 * U + step * U, 1.4 * U, 1.4 * U, '#f0c040');
    r(ctx, x0 + 10.4 * U, y0 + 27.4 * U - step * U, 1.4 * U, 1.4 * U, '#f0c040');
    r(ctx, x0 + 4 * U, y0 + 13 * U, 8 * U, 9 * U, '#4f9b4f');
    r(ctx, x0 + 4 * U, y0 + 20 * U, 8 * U, 1.4 * U, '#f0c040');
    r(ctx, x0 + 2.6 * U, y0 + 13.5 * U, 1.6 * U, 7 * U, '#4f9b4f');
    r(ctx, x0 + 12 * U, y0 + 13.5 * U, 1.6 * U, 7 * U, '#4f9b4f');
    r(ctx, x0 + 3.5 * U, y0 + 4 * U, 9 * U, 8.5 * U, '#f6cfa8');
    // 精灵耳朵
    r(ctx, x0 + 2.6 * U, y0 + 7 * U, 1 * U, 1.6 * U, '#f6cfa8');
    r(ctx, x0 + 12.4 * U, y0 + 7 * U, 1 * U, 1.6 * U, '#f6cfa8');
    r(ctx, x0 + 3.1 * U, y0 + 2.8 * U, 9.8 * U, 2.2 * U, '#2f7a3a');
    ctx.fillStyle = '#2f7a3a';
    ctx.beginPath(); ctx.moveTo((x0 + 3.1) * U, (y0 + 3) * U);
    ctx.lineTo((x0 + 12.9) * U, (y0 + 3) * U); ctx.lineTo((x0 + 8) * U, (y0 - 4) * U);
    ctx.closePath(); ctx.fill();
    r(ctx, x0 + 6.9 * U, y0 - 4.6 * U, 2.2 * U, 2.2 * U, '#f0c040');
    r(ctx, x0 + 5.4 * U, y0 + 7.2 * U, 1.1 * U, 1.4 * U, '#2b2119');
    r(ctx, x0 + 9.5 * U, y0 + 7.2 * U, 1.1 * U, 1.4 * U, '#2b2119');
    r(ctx, x0 + 6.2 * U, y0 + 9.6 * U, 3.6 * U, 0.8 * U, '#c96a5a');
    // 手里的礼物
    r(ctx, x0 + 13.2 * U, y0 + 18.6 * U, 3.4 * U, 3 * U, '#e0563f');
    r(ctx, x0 + 14.6 * U, y0 + 18.6 * U, 0.8 * U, 3 * U, '#f4ead8');
  }

  function drawBarista(ctx, cx, cy, t, frame) {
    if (window.Chars && window.Chars.drawBarista) { window.Chars.drawBarista(ctx, cx, cy, t, frame); return; }
    var x0 = cx - 8 * U, y0 = cy - 28 * U;
    var step = (frame === 1) ? 1 : (frame === 3 ? -1 : 0);
    r(ctx, x0 + 5 * U, y0 + 22 * U + step * U, 2.5 * U, 6 * U, '#4a3b32');
    r(ctx, x0 + 8.5 * U, y0 + 22 * U - step * U, 2.5 * U, 6 * U, '#4a3b32');
    r(ctx, x0 + 4 * U, y0 + 13 * U, 8 * U, 9 * U, '#e8e2d6');
    r(ctx, x0 + 5.6 * U, y0 + 13 * U, 4.8 * U, 9 * U, '#8a5a3a');
    r(ctx, x0 + 2.6 * U, y0 + 13.5 * U, 1.6 * U, 7 * U, '#e8e2d6');
    r(ctx, x0 + 12 * U, y0 + 13.5 * U, 1.6 * U, 7 * U, '#e8e2d6');
    r(ctx, x0 + 3.5 * U, y0 + 4 * U, 9 * U, 8.5 * U, '#f6cfa8');
    r(ctx, x0 + 3.1 * U, y0 + 2.6 * U, 9.8 * U, 2.4 * U, '#4a3b32');
    r(ctx, x0 + 3.1 * U, y0 + 4.4 * U, 1.4 * U, 3 * U, '#6a4a3a');    // 侧发
    r(ctx, x0 + 11.5 * U, y0 + 4.4 * U, 1.4 * U, 3 * U, '#6a4a3a');
    r(ctx, x0 + 5.4 * U, y0 + 7.2 * U, 1.1 * U, 1.4 * U, '#2b2119');
    r(ctx, x0 + 9.5 * U, y0 + 7.2 * U, 1.1 * U, 1.4 * U, '#2b2119');
    r(ctx, x0 + 6.2 * U, y0 + 9.6 * U, 3.6 * U, 0.8 * U, '#c96a5a');
    // 端着的托盘 + 两杯热可可
    r(ctx, x0 + 13 * U, y0 + 16.4 * U, 4.4 * U, 1 * U, '#c9a06a');
    r(ctx, x0 + 13.6 * U, y0 + 14.6 * U, 1.4 * U, 1.8 * U, '#8a5a3a');
    r(ctx, x0 + 15.6 * U, y0 + 14.6 * U, 1.4 * U, 1.8 * U, '#8a5a3a');
  }

  /* v4.3 村民（邮差 / 面包师 / 牧羊女 / 老木匠）：直接交给 Chars 画，
     没有降级版本——这几个人只在 v4.3 之后存在，老浏览器降级不影响主线。 */
  function drawVillager(ctx, cx, cy, t, style, frame) {
    if (window.Chars && window.Chars.drawVillager) { window.Chars.drawVillager(ctx, cx, cy, t, style, frame); return; }
    var x0 = cx - 8 * U, y0 = cy - 28 * U;
    r(ctx, x0 + 4 * U, y0 + 13 * U, 8 * U, 9 * U, '#5c7f9e');
    r(ctx, x0 + 3.5 * U, y0 + 4 * U, 9 * U, 8.5 * U, '#f6cfa8');
    r(ctx, x0 + 3.1 * U, y0 + 3 * U, 9.8 * U, 2.6 * U, '#4a3b32');
    r(ctx, x0 + 5.4 * U, y0 + 7.2 * U, 1.1 * U, 1.4 * U, '#2b2119');
    r(ctx, x0 + 9.5 * U, y0 + 7.2 * U, 1.1 * U, 1.4 * U, '#2b2119');
  }

  return {
    drawCharacter: drawCharacter, drawSanta: drawSanta, drawSnowman: drawSnowman,
    drawElf: drawElf, drawBarista: drawBarista, drawVillager: drawVillager
  };
})();
