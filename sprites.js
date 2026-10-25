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
    }
  };

  /* 主角色绘制
   * ctx, cx/cy = 脚底中心点（世界坐标）
   * dir: 0下 1上 2左 3右；frame: 0-3 行走循环；wave: 是否挥手
   * o: { gender:'m'|'f', glasses:bool, hairStyle:'short'|'long', outfit:'winter'|'santa'|'home' }
   * t: 可选，时间戳 ms —— 用于待机呼吸动画
   */
  function drawCharacter(ctx, cx, cy, dir, frame, o, wave, t) {
    var outfit = (OUTFITS[o.outfit] && OUTFITS[o.outfit][o.gender]) || OUTFITS.winter.m;
    var isM = o.gender === 'm';
    var skin = '#f6cfa8';
    var hair = isM ? '#241d18' : '#4a3226';
    var H = isM ? 29 : 27;              // Charles 稍高
    var BW = isM ? 7.4 : 8.2;           // Julie 身形略宽（裙装）
    var x0 = cx - 8 * U, y0 = cy - H * U;
    var step = (frame === 1) ? 1 : (frame === 3 ? -1 : 0);
    // 待机呼吸（走路时停用）
    var breathe = (frame === 0 && typeof t === 'number') ? (Math.sin(t / 480) > 0 ? 0.6 : 0) : 0;
    y0 -= breathe * U * 0.5;
    var skirt = !isM && o.outfit !== 'home';

    // ---- 腿与鞋 ----
    var legY = y0 + (H - 7) * U;
    var legLen = 6 * U;
    r(ctx, x0 + 5 * U, legY + step * U, 2.5 * U, legLen, outfit.legs);
    r(ctx, x0 + 8.5 * U, legY - step * U, 2.5 * U, legLen, outfit.legs);
    r(ctx, x0 + 4.8 * U, legY + legLen + step * U, 3 * U, 2 * U, outfit.boots);
    r(ctx, x0 + 8.3 * U, legY + legLen - step * U, 3 * U, 2 * U, outfit.boots);

    // ---- 长发背面（Julie，背面时及腰长发覆盖）----
    if (o.hairStyle === 'long' && dir === 1) {
      r(ctx, x0 + 3 * U, y0 + 8 * U, 10 * U, (H - 10) * U, hair);
      r(ctx, x0 + 3.6 * U, y0 + (H - 3) * U, 8.8 * U, 1.6 * U, '#5f4130'); // 发梢高光
    }

    // ---- 裙摆（Julie）----
    if (skirt) {
      r(ctx, x0 + 3.2 * U, y0 + 19 * U, 9.6 * U, 4.5 * U, outfit.top);
      r(ctx, x0 + 2.6 * U, y0 + 22 * U, 10.8 * U, 2.2 * U, outfit.trim);
    }

    // ---- 躯干 ----
    var bodyW = isM ? 7.4 : 7.8;
    var bodyX = x0 + (16 - bodyW) / 2 * U;
    var bodyY = y0 + 12.6 * U;
    r(ctx, bodyX, bodyY, bodyW * U, 8 * U, outfit.top);
    // 衣服下摆/扣子
    if (o.outfit === 'santa') {
      r(ctx, bodyX, bodyY + 5.4 * U, bodyW * U, 1.2 * U, '#3a2c22');
      r(ctx, bodyX + (bodyW / 2 - 0.8) * U, bodyY + 5.4 * U, 1.6 * U, 1.2 * U, '#f0c040');
      for (var sb = 0; sb < 3; sb++) r(ctx, bodyX + (bodyW / 2 - 0.4) * U, bodyY + (0.8 + sb * 1.6) * U, 0.9 * U, 0.9 * U, '#3a2c22');
    } else if (o.outfit === 'winter') {
      r(ctx, bodyX + (bodyW / 2 - 0.4) * U, bodyY + 1.6 * U, 0.9 * U, 5.4 * U, outfit.trim);
    } else if (isM) {
      // Charles 格子睡衣
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      for (var g1 = 0; g1 < 3; g1++) ctx.fillRect(bodyX, bodyY + g1 * 2.6 * U, bodyW * U, 0.6 * U);
      for (var g2 = 0; g2 < 3; g2++) ctx.fillRect(bodyX + g2 * 2.6 * U + 0.8 * U, bodyY, 0.6 * U, 8 * U);
    } else {
      // Julie 睡衣小爱心
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(bodyX + 1.6 * U, bodyY + 2.4 * U, 0.8 * U, 0.8 * U);
      ctx.fillRect(bodyX + 5 * U, bodyY + 5 * U, 0.8 * U, 0.8 * U);
    }

    // ---- 围巾 ----
    if (outfit.scarf) {
      r(ctx, bodyX - 0.4 * U, bodyY - 0.4 * U, (bodyW + 0.8) * U, 1.7 * U, outfit.scarf);
      r(ctx, bodyX + (bodyW - 1.8) * U, bodyY + 1.2 * U, 1.8 * U, 4.2 * U, outfit.scarf);
      r(ctx, bodyX + (bodyW - 1.8) * U, bodyY + 5.2 * U, 1.8 * U, 0.7 * U, 'rgba(0,0,0,.15)');
    }

    // ---- 手臂 ----
    var armY = bodyY + 0.6 * U;
    var armX_L = bodyX - 1.7 * U, armX_R = bodyX + bodyW * U + 0.1 * U;
    r(ctx, armX_L, armY + (frame === 1 ? U : 0), 1.6 * U, 6.6 * U, outfit.top);
    r(ctx, armX_L, armY + 6.2 * U + (frame === 1 ? U : 0), 1.6 * U, 1.2 * U, skin); // 手
    if (wave) {
      // 挥手：举高 + 摆动
      var wob = (typeof t === 'number' && Math.sin(t / 120) > 0) ? 1 : 0;
      r(ctx, armX_R, y0 + (4 - wob) * U, 1.6 * U, 8 * U, outfit.top);
      r(ctx, armX_R + wob * 1.4 * U, y0 + (2.4 - wob) * U, 1.6 * U, 1.8 * U, skin);
    } else {
      r(ctx, armX_R, armY + (frame === 3 ? U : 0), 1.6 * U, 6.6 * U, outfit.top);
      r(ctx, armX_R, armY + 6.2 * U + (frame === 3 ? U : 0), 1.6 * U, 1.2 * U, skin);
    }

    // ---- 头 ----
    var hw = 9 * U;
    var hx = x0 + 3.5 * U, hy = y0 + (isM ? 3.6 : 4.2) * U;
    r(ctx, hx, hy, hw, 8.5 * U, skin);

    // ---- 头发 ----
    if (dir === 1) {
      // 背面
      r(ctx, hx - 0.4 * U, hy - 1.2 * U, hw + 0.8 * U, 9 * U, hair);
      if (isM) r(ctx, hx + 1.6 * U, hy + 5.4 * U, 5.8 * U, 1.2 * U, '#3a2c22'); // 后颈
    } else {
      r(ctx, hx - 0.4 * U, hy - 1.4 * U, hw + 0.8 * U, 3 * U, hair);           // 顶发
      if (o.hairStyle === 'long') {
        // 刘海
        r(ctx, hx - 0.4 * U, hy + 1.6 * U, 2.2 * U, 1.4 * U, hair);
        r(ctx, hx + hw - 1.8 * U, hy + 1.6 * U, 2.2 * U, 1.4 * U, hair);
        r(ctx, hx + 2.2 * U, hy - 0.4 * U, hw - 4.4 * U, 1.2 * U, hair);
        // 及腰长发两侧（走路时轻摆）
        var sway = (frame === 1 || frame === 3) ? 0.5 : 0;
        r(ctx, hx - 0.7 * U - sway * U, hy + 1.4 * U, 2 * U, 15.5 * U, hair);
        r(ctx, hx + hw - 1.3 * U + sway * U, hy + 1.4 * U, 2 * U, 15.5 * U, hair);
        r(ctx, hx - 0.7 * U - sway * U, hy + 15 * U, 2 * U, 1.5 * U, '#5f4130');
        r(ctx, hx + hw - 1.3 * U + sway * U, hy + 15 * U, 2 * U, 1.5 * U, '#5f4130');
      } else {
        r(ctx, hx - 0.4 * U, hy - 1.4 * U, 1.7 * U, 5.5 * U, hair);
        r(ctx, hx + hw - 1.3 * U, hy - 1.4 * U, 1.7 * U, 5.5 * U, hair);
        r(ctx, hx - 0.4 * U, hy + 3.6 * U, 1.5 * U, 2 * U, hair);
        r(ctx, hx + hw - 1.1 * U, hy + 3.6 * U, 1.5 * U, 2 * U, hair);
      }
    }

    // ---- 帽子 ----
    if (outfit.hat === 'santa') {
      r(ctx, hx - 0.6 * U, hy - 2.4 * U, hw + 1.2 * U, 1.6 * U, '#ffffff');
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.moveTo((x0 + 2.6) * U, (hy - 2) * U);
      ctx.lineTo((x0 + 13.4) * U, (hy - 2) * U);
      ctx.lineTo((x0 + (dir === 2 ? 5.4 : 10.4)) * U, (hy - 6.8) * U);
      ctx.closePath(); ctx.fill();
      r(ctx, (x0 + 9.2) * U, (hy - 7.6) * U, 2 * U, 2 * U, '#ffffff');
    } else if (outfit.hat === 'beanie') {
      // Julie 冬季白绒帽
      r(ctx, hx - 0.8 * U, hy - 1.8 * U, hw + 1.6 * U, 2.6 * U, '#f4ead8');
      ctx.fillStyle = '#e8dcc8';
      ctx.beginPath();
      ctx.moveTo((hx - 0.8) * U, (hy - 1) * U);
      ctx.quadraticCurveTo((hx + hw / 2) * U, (hy - 5.6) * U, (hx + hw + 0.8) * U, (hy - 1) * U);
      ctx.closePath(); ctx.fill();
      r(ctx, (hx + hw / 2 - 1.1) * U, (hy - 6.6) * U, 2.2 * U, 2.2 * U, '#f4ead8');
    }

    // ---- 脸部 ----
    if (dir !== 1) {
      var eyeY = hy + 4.4 * U;
      var blushC = isM ? 'rgba(240,150,140,.5)' : 'rgba(240,140,140,.65)';
      if (dir === 0) {
        r(ctx, hx + 2 * U, eyeY, 1.1 * U, 1.4 * U, '#2b2119');
        r(ctx, hx + hw - 3.1 * U, eyeY, 1.1 * U, 1.4 * U, '#2b2119');
        // 嘴（小微笑）
        r(ctx, hx + 4 * U, hy + 6.8 * U, 1.2 * U, 0.5 * U, '#c96a5a');
        // 腮红
        r(ctx, hx + 0.9 * U, hy + 6.2 * U, 1.5 * U, 0.8 * U, blushC);
        r(ctx, hx + hw - 2.4 * U, hy + 6.2 * U, 1.5 * U, 0.8 * U, blushC);
        if (o.glasses) {
          r(ctx, hx + 1.4 * U, eyeY - 0.6 * U, 3 * U, 2.6 * U, 'rgba(40,44,52,.30)');
          r(ctx, hx + hw - 4.4 * U, eyeY - 0.6 * U, 3 * U, 2.6 * U, 'rgba(40,44,52,.30)');
          ctx.fillStyle = '#1a1c20';
          ctx.fillRect((hx + 1.3) * U, (eyeY - 0.8) * U, 3.2 * U, 0.6 * U);
          ctx.fillRect((hx + hw - 4.5) * U, (eyeY - 0.8) * U, 3.2 * U, 0.6 * U);
          ctx.fillRect((hx + 4.5) * U, (eyeY - 0.5) * U, (hw - 9) * U, 0.5 * U);   // 鼻梁架
          ctx.fillRect((hx + 1.3) * U, (eyeY - 0.8) * U, 0.5 * U, 1.6 * U);        // 左腿
          ctx.fillRect((hx + hw - 1.8) * U, (eyeY - 0.8) * U, 0.5 * U, 1.6 * U);   // 右腿
        }
      } else {
        var ex = (dir === 2) ? hx + 1.2 * U : hx + hw - 2.3 * U;
        r(ctx, ex, eyeY, 1.1 * U, 1.4 * U, '#2b2119');
        r(ctx, (dir === 2 ? hx + 0.6 : hx + hw - 2.2) * U, hy + 6.4 * U, 1.4 * U, 0.8 * U, blushC);
        if (o.glasses) {
          ctx.fillStyle = '#1a1c20';
          ctx.fillRect((ex - 0.5) * U, (eyeY - 0.8) * U, 2.1 * U, 0.6 * U);
          ctx.fillRect((ex - 0.5) * U, (eyeY - 0.8) * U, 0.5 * U, 2.8 * U);
        }
      }
    }
  }

  /* ---------- NPC ---------- */

  function drawSanta(ctx, cx, cy, t) {
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

  return {
    drawCharacter: drawCharacter, drawSanta: drawSanta, drawSnowman: drawSnowman,
    drawElf: drawElf, drawBarista: drawBarista
  };
})();
