/* sprites.js — 程序化像素角色绘制（Charles / Julie / NPC）
 * 全部用 Canvas 矩形绘制，无外部图片资源。
 * 角色造型基于 design-assets/charles-julie-design-v2.png 定稿：
 *   Charles：短发、黑框眼镜、瘦削、米白毛衣+蓝围巾
 *   Julie：年轻、及腰长直发+刘海、条纹上衣
 */
window.Sprites = (function () {
  'use strict';
  var U = 2; // 每个艺术像素 = 2 屏幕像素

  function r(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w * U), Math.round(h * U));
  }

  // 服装配色表
  var OUTFITS = {
    winter: { top: '#efe6d4', trim: '#d8cbb2', legs: '#3c4658', boots: '#6b4a2f', scarf: '#4f86d6', hat: null },
    santa:  { top: '#c0392b', trim: '#ffffff', legs: '#c0392b', boots: '#3a2c22', scarf: null, hat: 'santa' },
    home:   { top: '#b784a9', trim: '#d9b9cf', legs: '#a06f94', boots: '#c9a5b8', scarf: null, hat: null }
  };

  /* 主角色绘制
   * ctx, cx/cy = 脚底中心点（世界坐标）
   * dir: 0下 1上 2左 3右；frame: 0-3 行走循环；wave: 是否挥手
   * o: { gender:'m'|'f', glasses:bool, outfit:'winter'|'santa'|'home' }
   */
  function drawCharacter(ctx, cx, cy, dir, frame, o, wave) {
    var outfit = OUTFITS[o.outfit] || OUTFITS.winter;
    var skin = '#f6cfa8', hair = o.gender === 'm' ? '#241d18' : '#3a2b22';
    var x0 = cx - 8 * U, y0 = cy - 28 * U; // 16 x 28 艺术格
    var step = (frame === 1) ? 1 : (frame === 3 ? -1 : 0); // 腿部摆动

    // ---- 腿与鞋 ----
    var legY = y0 + 22 * U;
    r(ctx, x0 + 5 * U, legY + step * U, 2.5 * U, 6 * U, outfit.legs);
    r(ctx, x0 + 8.5 * U, legY - step * U, 2.5 * U, 6 * U, outfit.legs);
    r(ctx, x0 + 5 * U, legY + (5 + step) * U, 2.5 * U, 2 * U, outfit.boots);
    r(ctx, x0 + 8.5 * U, legY + (5 - step) * U, 2.5 * U, 2 * U, outfit.boots);

    // ---- 躯干 ----
    r(ctx, x0 + 4 * U, y0 + 13 * U, 8 * U, 9 * U, outfit.top);
    if (o.outfit === 'winter' && o.gender === 'f') { // Julie 条纹
      for (var i = 0; i < 4; i++) r(ctx, x0 + 4 * U, y0 + (14 + i * 2) * U, 8 * U, 0.8 * U, '#c9c9c9');
    }
    if (o.outfit === 'santa') { // 圣诞装腰带
      r(ctx, x0 + 4 * U, y0 + 18 * U, 8 * U, 1.2 * U, '#3a2c22');
      r(ctx, x0 + 7.2 * U, y0 + 18 * U, 1.6 * U, 1.2 * U, '#f0c040');
    }
    if (outfit.scarf) {
      r(ctx, x0 + 4 * U, y0 + 12.4 * U, 8 * U, 1.6 * U, outfit.scarf);
      r(ctx, x0 + 9 * U, y0 + 13.6 * U, 1.6 * U, 4 * U, outfit.scarf); // 垂下的围巾角
    }

    // ---- 手臂（挥手时一只抬起）----
    var armY = y0 + 13.5 * U;
    r(ctx, x0 + 2.6 * U, armY + (frame === 1 ? U : 0), 1.6 * U, 7 * U, outfit.top);
    if (wave) {
      r(ctx, x0 + 12 * U, y0 + 5 * U, 1.6 * U, 8 * U, outfit.top); // 举起的手臂
      r(ctx, x0 + 12 * U, y0 + 3.4 * U, 1.6 * U, 2 * U, skin);     // 手
    } else {
      r(ctx, x0 + 12 * U, armY + (frame === 3 ? U : 0), 1.6 * U, 7 * U, outfit.top);
    }

    // ---- 长发背面（Julie，背面时整片覆盖）----
    if (o.hairStyle === 'long' && dir === 1) {
      r(ctx, x0 + 3.4 * U, y0 + 9 * U, 9.2 * U, 14 * U, hair);
    }

    // ---- 头 ----
    var hx = x0 + 3.5 * U, hy = y0 + 4 * U, hw = 9 * U;
    r(ctx, hx, hy, hw, 8.5 * U, skin);

    // ---- 头发 ----
    if (dir === 1) { // 背面：整个头是头发
      r(ctx, hx - 0.4 * U, hy - 1 * U, hw + 0.8 * U, 8.5 * U, hair);
    } else {
      r(ctx, hx - 0.4 * U, hy - 1.2 * U, hw + 0.8 * U, 3 * U, hair);          // 顶发
      r(ctx, hx - 0.4 * U, hy - 1.2 * U, 1.6 * U, 5.5 * U, hair);             // 侧发
      r(ctx, hx + hw - 1.2 * U, hy - 1.2 * U, 1.6 * U, 5.5 * U, hair);
      if (o.hairStyle === 'long') {                                            // 长发垂肩
        r(ctx, hx - 0.4 * U, hy + 1.8 * U, 1.8 * U, 12 * U, hair);
        r(ctx, hx + hw - 1.4 * U, hy + 1.8 * U, 1.8 * U, 12 * U, hair);
      } else {
        r(ctx, hx - 0.4 * U, hy + 1.5 * U, 1.4 * U, 2.5 * U, hair);
        r(ctx, hx + hw - 1.0 * U, hy + 1.5 * U, 1.4 * U, 2.5 * U, hair);
      }
    }

    // ---- 帽子（圣诞装）----
    if (outfit.hat === 'santa') {
      r(ctx, hx - 0.6 * U, hy - 2.4 * U, hw + 1.2 * U, 1.6 * U, '#ffffff');
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.moveTo((x0 + 2.6) * U, (hy - 2) * U);
      ctx.lineTo((x0 + 13.4) * U, (hy - 2) * U);
      ctx.lineTo((x0 + 8) * U, (hy - 6.4) * U);
      ctx.closePath();
      ctx.fill();
      r(ctx, (x0 + 6.6) * U, (hy - 7.2) * U, 2 * U, 2 * U, '#ffffff'); // 绒球
    }

    // ---- 脸部（仅正面/侧面）----
    if (dir !== 1) {
      var eyeY = hy + 4.2 * U;
      if (dir === 0) {
        r(ctx, hx + 2 * U, eyeY, 1.1 * U, 1.4 * U, '#2b2119');
        r(ctx, hx + hw - 3.1 * U, eyeY, 1.1 * U, 1.4 * U, '#2b2119');
        r(ctx, hx + 1.4 * U, hy + 6.4 * U, 1.4 * U, 0.8 * U, 'rgba(240,150,140,.55)'); // 腮红
        r(ctx, hx + hw - 2.8 * U, hy + 6.4 * U, 1.4 * U, 0.8 * U, 'rgba(240,150,140,.55)');
        if (o.glasses) {
          r(ctx, hx + 1.4 * U, eyeY - 0.5 * U, 3 * U, 2.4 * U, 'rgba(20,20,20,.28)');   // 镜片
          r(ctx, hx + hw - 4.4 * U, eyeY - 0.5 * U, 3 * U, 2.4 * U, 'rgba(20,20,20,.28)');
          ctx.fillStyle = '#141414';
          ctx.fillRect((hx + 1.4) * U, (eyeY - 0.7) * U, 3 * U, 0.5 * U);
          ctx.fillRect((hx + hw - 4.4) * U, (eyeY - 0.7) * U, 3 * U, 0.5 * U);
          ctx.fillRect((hx + 4.4) * U, (eyeY - 0.35) * U, (hw - 8.8) * U, 0.5 * U);      // 鼻梁架
        }
      } else {
        var ex = (dir === 2) ? hx + 1.2 * U : hx + hw - 2.3 * U;
        r(ctx, ex, eyeY, 1.1 * U, 1.4 * U, '#2b2119');
        if (o.glasses) {
          ctx.fillStyle = '#141414';
          ctx.fillRect((ex - 0.4) * U, (eyeY - 0.7) * U, 1.9 * U, 0.5 * U);
          ctx.fillRect((ex - 0.4) * U, (eyeY - 0.7) * U, 0.5 * U, 2.6 * U);
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
    r(ctx, x0 + 3 * U, y0 + 10 * U, 12 * U, 11 * U, '#c0392b');      // 大红袍
    r(ctx, x0 + 3 * U, y0 + 18 * U, 12 * U, 1.6 * U, '#ffffff');
    r(ctx, x0 + 2 * U, y0 + 11 * U, 1.8 * U, 8 * U, '#c0392b');
    r(ctx, x0 + 14.2 * U, y0 + 11 * U, 1.8 * U, 8 * U, '#c0392b');
    r(ctx, x0 + 4 * U, y0 + 3 * U, 10 * U, 7 * U, '#f6cfa8');        // 脸
    r(ctx, x0 + 4.4 * U, y0 + 8 * U, 9.2 * U, 5 * U, '#f2f2f2');     // 白胡子
    r(ctx, x0 + 5.2 * U, y0 + 1.4 * U, 1.2 * U, 1.2 * U, '#2b2119'); // 眼
    r(ctx, x0 + 11.6 * U, y0 + 1.4 * U, 1.2 * U, 1.2 * U, '#2b2119');
    r(ctx, x0 + 3.4 * U, y0 - 1 * U, 11.2 * U, 1.8 * U, '#ffffff');  // 帽沿
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo((x0 + 3.4) * U, (y0 - 0.6) * U);
    ctx.lineTo((x0 + 14.6) * U, (y0 - 0.6) * U);
    ctx.lineTo((x0 + 9) * U, (y0 - 6.5) * U);
    ctx.closePath(); ctx.fill();
    r(ctx, x0 + 7.8 * U, y0 - 7.4 * U, 2.2 * U, 2.2 * U, '#ffffff');
  }

  function drawSnowman(ctx, cx, cy, t) {
    var bob = Math.sin(t / 700) > 0 ? 0 : 1;
    var x0 = cx - 8 * U, y0 = cy - 26 * U - bob;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy - 5 * U, 8 * U, 0, 7); ctx.fill();     // 底
    ctx.beginPath(); ctx.arc(cx, cy - 16 * U, 6 * U, 0, 7); ctx.fill();    // 中
    ctx.beginPath(); ctx.arc(cx, cy - 24 * U, 4.6 * U, 0, 7); ctx.fill();  // 头
    r(ctx, x0 + 1 * U, y0 + 9 * U, 14 * U, 1.6 * U, '#c0392b');            // 围巾
    r(ctx, x0 + 6.5 * U, y0 + 10 * U, 2.4 * U, 4 * U, '#c0392b');
    r(ctx, cx - 1.2 * U, cy - 24.5 * U, 2.6 * U, 1 * U, '#e8934a');        // 胡萝卜鼻
    r(ctx, cx - 2.6 * U, cy - 26.5 * U, 1.1 * U, 1.1 * U, '#2b2119');      // 眼
    r(ctx, cx + 1.5 * U, cy - 26.5 * U, 1.1 * U, 1.1 * U, '#2b2119');
    ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = U;                        // 树枝手
    ctx.beginPath(); ctx.moveTo(cx - 6 * U, cy - 15 * U); ctx.lineTo(cx - 12 * U, cy - 20 * U); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 6 * U, cy - 15 * U); ctx.lineTo(cx + 12 * U, cy - 20 * U); ctx.stroke();
  }

  function drawElf(ctx, cx, cy, t, frame) {
    var x0 = cx - 8 * U, y0 = cy - 28 * U;
    var step = (frame === 1) ? 1 : (frame === 3 ? -1 : 0);
    r(ctx, x0 + 5 * U, y0 + 22 * U + step * U, 2.5 * U, 6 * U, '#3f6b3f');
    r(ctx, x0 + 8.5 * U, y0 + 22 * U - step * U, 2.5 * U, 6 * U, '#3f6b3f');
    r(ctx, x0 + 4 * U, y0 + 13 * U, 8 * U, 9 * U, '#4f9b4f');        // 绿衣
    r(ctx, x0 + 4 * U, y0 + 20 * U, 8 * U, 1.4 * U, '#f0c040');      // 腰带
    r(ctx, x0 + 2.6 * U, y0 + 13.5 * U, 1.6 * U, 7 * U, '#4f9b4f');
    r(ctx, x0 + 12 * U, y0 + 13.5 * U, 1.6 * U, 7 * U, '#4f9b4f');
    r(ctx, x0 + 3.5 * U, y0 + 4 * U, 9 * U, 8.5 * U, '#f6cfa8');
    r(ctx, x0 + 3.1 * U, y0 + 2.8 * U, 9.8 * U, 2.2 * U, '#2f7a3a'); // 尖帽
    ctx.fillStyle = '#2f7a3a';
    ctx.beginPath(); ctx.moveTo((x0 + 3.1) * U, (y0 + 3) * U);
    ctx.lineTo((x0 + 12.9) * U, (y0 + 3) * U); ctx.lineTo((x0 + 8) * U, (y0 - 4) * U);
    ctx.closePath(); ctx.fill();
    r(ctx, x0 + 6.9 * U, y0 - 4.6 * U, 2.2 * U, 2.2 * U, '#f0c040');
    r(ctx, x0 + 5.4 * U, y0 + 7.2 * U, 1.1 * U, 1.4 * U, '#2b2119');
    r(ctx, x0 + 9.5 * U, y0 + 7.2 * U, 1.1 * U, 1.4 * U, '#2b2119');
    r(ctx, x0 + 6.2 * U, y0 + 9.6 * U, 3.6 * U, 0.8 * U, '#c96a5a'); // 微笑
  }

  function drawBarista(ctx, cx, cy, t, frame) {
    var x0 = cx - 8 * U, y0 = cy - 28 * U;
    var step = (frame === 1) ? 1 : (frame === 3 ? -1 : 0);
    r(ctx, x0 + 5 * U, y0 + 22 * U + step * U, 2.5 * U, 6 * U, '#4a3b32');
    r(ctx, x0 + 8.5 * U, y0 + 22 * U - step * U, 2.5 * U, 6 * U, '#4a3b32');
    r(ctx, x0 + 4 * U, y0 + 13 * U, 8 * U, 9 * U, '#e8e2d6');
    r(ctx, x0 + 5.6 * U, y0 + 13 * U, 4.8 * U, 9 * U, '#8a5a3a');    // 围裙
    r(ctx, x0 + 2.6 * U, y0 + 13.5 * U, 1.6 * U, 7 * U, '#e8e2d6');
    r(ctx, x0 + 12 * U, y0 + 13.5 * U, 1.6 * U, 7 * U, '#e8e2d6');
    r(ctx, x0 + 3.5 * U, y0 + 4 * U, 9 * U, 8.5 * U, '#f6cfa8');
    r(ctx, x0 + 3.1 * U, y0 + 2.6 * U, 9.8 * U, 2.4 * U, '#4a3b32'); // 束发
    r(ctx, x0 + 5.4 * U, y0 + 7.2 * U, 1.1 * U, 1.4 * U, '#2b2119');
    r(ctx, x0 + 9.5 * U, y0 + 7.2 * U, 1.1 * U, 1.4 * U, '#2b2119');
    r(ctx, x0 + 6.2 * U, y0 + 9.6 * U, 3.6 * U, 0.8 * U, '#c96a5a');
  }

  return { drawCharacter: drawCharacter, drawSanta: drawSanta, drawSnowman: drawSnowman, drawElf: drawElf, drawBarista: drawBarista };
})();
