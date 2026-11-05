/* story.js — v5.1「极光之前」剧情与演出
 * ------------------------------------------------------------
 * 这个文件只管三件事：
 *   1) 剧情阶段（stage）、极夜等级（polar）、NPC 台词档位的**推导**（不存冗余状态）
 *   2) NPC 台词：按阶段逐渐多出来，前期只字不提禾，后期才慢慢对上号
 *   3) 两段 cinematic 的绘制：冰岛「极光」与小镇「天亮」
 *
 * 为什么单独一个文件：
 *   game.js 已经 9000 行，演出和台词塞进去会彻底失控。
 *   这里只做纯绘制与文本，不碰存档、不碰 Firebase（写操作全部在 game.js）。
 *
 * 性能：星野 / 山脊 / 冰湖这些静态层烘三张位图；每帧只画会动的极光与光点。
 */
window.Story = (function () {
  'use strict';

  /* ============================================================
   * 0. 剧情链（唯一可信来源）
   * ------------------------------------------------------------
   * 正式顺序（v5.4 校准后，北境是**独立隐藏剧情线**，不再看章节号）：
   *
   *   第 1~12 章  小镇生活 / 旅行 / 记忆 / 升级圣诞树（与北境线互不影响）
   *   资格        去过 4 个地方 + 树点亮 + 14 段回忆
   *               —— 这只代表「有资格」，不发车票、不开始极夜
   *   阿信的来信  north.hint.at（头顶蓝色感叹号）
   *   → 读信       hint.read → 极夜 1 级（光线开始不对）
   *   → 和 4 人聊 hint.talked
   *   → 极夜降临  hint.polarAt → 极夜 2 级
   *   → 北境入口  world.north.open
   *   → 双人星门 + 宝箱（极夜 3，拿到地图 / 御寒衣 / 极光盒）
   *   → **宝箱开了，冰岛车票才正式解锁**
   *   → 去冰岛，用极光盒（极夜 4）
   *   → 回镇天亮（极夜 0）
   *   → 最终圣诞筹备
   *
   * 所有状态**全部从 world 里已有的字段推出来**（world.north / world.travel /
   * world.treeStage / world.quest.found / world.finalPrep），
   * 不新增章节计数器，也不写 localStorage —— 两个人、两台设备、刷新页面
   * 看到的都是同一套天色。
   * ============================================================ */
  var BASE_TRAVEL = 4;        // 原有冰岛基础条件：去过 4 个地方
  /* 树门槛：stage 4 = 「即将点亮」。视觉上树从这一阶就 lit=true 全亮了
     （168 颗灯珠 + 挂星 + 蝴蝶结 + 彩球），玩家看到的「树点亮」就是这一阶。
     stage 5「完全点亮」只是灯更多（258 颗）、星更大、多挂灯笼的锦上添花，
     不应作为剧情硬门槛卡住玩家。所以资格条件是「树点亮」= treeStage >= 4。 */
  var BASE_TREE = 4;          // 树点亮（stage 4 起，treeStage 从 0 起算）
  var BASE_MEM = 14;          // 至少 14 段旅行记忆

  /* v5.4：北境不再是「第 10 章自动开门」，而是一条**隐藏剧情线**：
   *
   *   树点亮 + 14 段回忆 + 4 个旅行地   ← 只是资格
   *   → 阿信收到一封北边来的信（头顶蓝色感叹号）
   *   → 玩家主动找他，读信
   *   → 和镇上的人聊（4 位，分几次也行）
   *   → 极夜降临（一次演出，之后小镇不再天亮）
   *   → 北境传送门出现
   *   → 玩家自己走进去
   *
   * 状态全部落在 world.north.hint 里（at / read / talked / polarAt / portalAt），
   * 仍然不新开一套章节系统；章节 1~12 与这条线互不影响。
   */
  var NORTH_TALK_NEED = 4;    // 读信之后要聊过几个人

  /* 只读 world，把推导要用的几个数一次算出来。
     注意：不用 S.quest / 本地变量，保证两台设备算出的结果一致。 */
  function ctxOf(w) {
    w = w || {};
    var n = w.north || {};
    var found = (w.quest && w.quest.found) ? w.quest.found : {};
    var travels = w.travel || {};
    return {
      chapter: (w.chapter || 0),
      tree: (typeof w.treeStage === 'number' ? w.treeStage : 0),
      visits: Object.keys(travels).length,
      mem: Object.keys(found).length,
      iceland: !!travels.iceland,
      north: n,
      hint: n.hint || {},
      finalPrep: w.finalPrep || 0,
      revived: n.revived || w.revived || 0
    };
  }

  /* 原有冰岛基础条件 —— 一个数都没改，只是把它从「发车票」拆了出来 */
  function baseReady(w) {
    var c = ctxOf(w);
    return c.visits >= BASE_TRAVEL && c.tree >= BASE_TREE && c.mem >= BASE_MEM;
  }
  /* 隐藏剧情是否已经开始：资格到了，并且那封信已经出现 */
  function storyReady(w) {
    var c = ctxOf(w);
    return baseReady(w) && !!c.hint.at;
  }

  /* 隐藏剧情的五个小阶段（给 UI / 任务条用，不写存档，只读 world）：
   *   0 未开始 / 1 信到了（等玩家找阿信）/ 2 读过信（去和人聊）
   *   3 聊够了（极夜将落）/ 4 极夜已降临、门未开 / 5 门已开
   */
  function hintStageOf(w) {
    var c = ctxOf(w);
    var h = c.hint;
    if (!h || !h.at) return 0;
    if (h.portalAt || c.north.open) return 5;
    if (h.polarAt) return 4;
    var talked = (h.talked && typeof h.talked === 'object') ? Object.keys(h.talked).length : 0;
    if (h.read) return talked >= NORTH_TALK_NEED ? 3 : 2;
    return 1;
  }
  function hintTalked(w) {
    var h = ctxOf(w).hint;
    return (h.talked && typeof h.talked === 'object') ? Object.keys(h.talked).length : 0;
  }

  /* 主线阶段（北境那条线）
   *   0  门没出现
   *   1  北境入口出现 / 正在探索
   *   2  双人星门已开（拿到星钥）
   *   3  宝箱已开（地图 / 御寒衣 / 极光盒）
   *   4  极光演出完成
   *   5  回到小镇，天亮了
   *   6  最终圣诞筹备
   */
  function stageOf(w) {
    var c = ctxOf(w);
    if (c.finalPrep) return 6;
    if (c.revived) return 5;
    if (c.north.auroraDone) return 4;
    if (c.north.opened) return 3;
    if (c.north.gateOpen) return 2;
    if (c.north.open) return 1;
    return 0;
  }

  /* 极夜等级 0~4：0 正常，4 彻底极夜。
     1 级 = 「光开始不对」：信读过了、镇上都知道了，但极夜还没真正落下来。
     2 级 = 极夜降临（门出现）。之后一路保持，只有
     「冰岛极光演完 + 回到小镇」才归零。
     这一级不是章节推的，是隐藏剧情推的 —— 管理员跳章不会让它出现。 */
  function polarOf(w) {
    var c = ctxOf(w);
    if (c.revived) return 0;              // 天亮了
    if (c.north.auroraDone) return 4;     // 极光演完、还没回镇
    if (c.north.opened) return 3;         // 拿到盒子，天最黑
    if (c.north.open || c.hint.polarAt) return 2;   // 门出现了 / 极夜刚落
    if (c.hint.read) return 1;            // 信读完了：天开始不对
    return 0;
  }

  /* NPC 台词档位：-1 = 还没有剧情台词（第 1~8 章保持原来的日常对话） */
  function talkStageOf(w) {
    var s = stageOf(w);
    if (s >= 5) return 4;
    if (s >= 3) return 3;
    if (s === 2) return 2;
    if (s === 1) return 1;
    return polarOf(w) >= 1 ? 0 : -1;
  }

  /* ============================================================
   * 1. NPC 台词（v5.2：按「剧情节拍」整段分档）
   * ------------------------------------------------------------
   * v5.0/v5.1 的台词只分 5 档，而且只是「每次对话额外附赠一句」，
   * 日常那句永远是小镇的旧台词 —— 于是管理员跳章之后，玩家都拿到极光盒了，
   * NPC 还在问「最近天怎么黑了」。
   *
   * 现在每个 NPC 每一档都有**整段自己的台词池**：
   *   pool[0] = 这一档的关键句，一个档位只播一次（key = id:档位）
   *   pool[1..] = 这一档的日常句，循环轮播
   * 档位完全由 world 里的字段推导（和 stageOf 同源），所以：
   *   · 正常玩家按顺序走，台词自然推进；
   *   · 管理员跳章后，下一次对话立刻是新档位（不会残留旧档）；
   *   · 同一段关键对白不会无限重复；
   *   · 跳章也不会让对白消失 —— 每一档都有完整的池子兜底。
   * ============================================================ */
  var TIER = {
    NONE: -1,   // 极夜还没开始（第 1~8 章，仍用旧的日常台词）
    P0: 0,      // 极夜刚出现，北境入口还没开
    P1: 1,      // 北境入口出现 / 刚开始探索
    P2: 2,      // 探索中：铲子 / 信 / 雪橇 / 挖过坑
    P3: 3,      // 双人星门开启（禾的名字第一次被说出来）
    P4: 4,      // 宝箱开启（地图 / 御寒衣 / 极光盒）
    P5: 5,      // 极光演完，还没回镇
    P6: 6,      // 天亮了
    P7: 7       // 最终圣诞筹备
  };

  /* 当前该说哪一档 —— 只看 world，不看本地状态，所以两台设备一致、
     管理员跳章之后也立刻对上。 */
  function tierOf(w) {
    var c = ctxOf(w);
    var n = c.north || {};
    if (c.finalPrep) return TIER.P7;
    if (c.revived) return TIER.P6;
    if (n.auroraDone) return TIER.P5;
    if (n.opened) return TIER.P4;
    if (n.gateOpen) return TIER.P3;
    if (n.open) {
      var dug = (n.digs && typeof n.digs === 'object') ? Object.keys(n.digs).length : 0;
      return (n.shovel || n.letter || n.sled || dug) ? TIER.P2 : TIER.P1;
    }
    /* 信读过了、极夜还没落：整段台词换成「要变天了」那一套。
       还没读信时保持原来的日常台词 —— 不让 NPC 未卜先知。 */
    if (c.hint && c.hint.read) return TIER.P0;
    return TIER.NONE;
  }

  var TALK = {
    /* ---------------- 圣诞老人：知道得最多，说得最少 ---------------- */
    santa: [
      ['这几天天亮得越来越晚了。你们也感觉到了吧？',
        '别急着往北跑。先看看镇上 —— 光是从哪儿开始少的。',
        '树上的灯还亮着，这是好事。'],
      ['北边那片林子里，多了一道光。……那不是极光。',
        '有人在那边等了很多年。不是等你们，是等一个肯走进去的人。',
        '要去就两个人一起去。一个人走不出那片雪。'],
      ['铲子用着还顺手？老鲁的手艺，几十年了。',
        '雪底下埋着的东西不会自己跑，慢慢来。',
        '营地那辆旧雪橇，我年轻的时候见它新过。'],
      ['门开了。……那孩子叫禾。种树的那个禾。',
        '他当年也是这么进去的。走之前跟我说：等镇上再暗下来，就有人替我走完。',
        '记住这个名字。往北走的人，都是替他走完最后一段。'],
      ['地图？他真的一直在往北走啊。',
        '孩子，光不是取回来的。是要有人去把它叫醒。',
        '冰岛。那边天黑得比这儿还早 —— 可那边的黑，是会发光的。'],
      ['看到了？……他当年也看到了。',
        '只是他没来得及带回来。你们带回来了。',
        '回家吧。镇上的人等这一夜，等得太久了。'],
      ['天亮了。真的亮了。',
        '孩子，你们做的这件事，比点亮一棵树重要得多。',
        '去街上走走吧。每个人都想跟你们说句话。'],
      ['今年的圣诞夜，会是有光的那一种。',
        '树、灯、礼物、吃的 —— 还有把这些日子讲给彼此听。',
        '去吧，镇上都在忙。']
    ],

    /* ---------------- 老木匠 · 老鲁：木头、工具、手上活 ---------------- */
    carpenter: [
      ['木头的颜色不对了。晒不到太阳，木头比人先知道。',
        '我这炉子修了三回。不是坏了，是它不想烧。',
        '要真出了什么事，我这把老骨头还能替你钉点东西。'],
      ['北边林子夜里发亮。我砍过那儿的雪松，年轮密得吓人。',
        '那地方的冬天比这儿长 —— 长得多。',
        '我年轻时见过一个人往那边走，背着一卷东西，再没回来。'],
      ['铲子还好使吧？柄是我三十年前削的，榫头没松。',
        '雪底下那点东西，挖的时候轻点。底下的木头怕潮。',
        '要钉什么就说。这会儿我手上正好空。'],
      ['禾？认识。他跟我学过削榫头，手很稳。',
        '他说要去北边找一样东西。我问是什么，他说「等找到再告诉你」。',
        '……他到底找到没有？'],
      ['那件外套是我给他做的。领口那圈白毛，是我媳妇缝的。',
        '他留给你了？……那就穿着吧。别冻着。',
        '木头做成的东西，是替人挨冻的。'],
      ['你们回来的时候，我看见天上有东西在动。',
        '我这辈子没见过那样的光。',
        '禾要是看见了，大概会坐下来，一句话都不说。'],
      ['我今早刨木头，刨花是金色的。好多年没见过了。',
        '终于又能看清木头的纹路了。',
        '光一回来，手就稳了。'],
      ['架子我钉好了。结实，站十个人都不塌。',
        '彩带别绕太紧，松一点才好看。',
        '这棵树，是你们两个人一起养出来的。']
    ],

    /* ---------------- 邮差 · 阿信：送不出去的信 ---------------- */
    postman: [
      ['有封信我压了十年，收件地址只写了「北边」。',
        '这几天邮袋特别沉，可我该送的都送完了。',
        '……信是不是也在等什么？'],
      ['雪地上多了一圈发蓝的符文，就在湖中间。',
        '我这辈子没见过那样的字，倒像是……地址。',
        '「北边」，没有门牌，没有街名。就两个字。'],
      ['那封信……你要是往北走，能不能替我看看？',
        '收件人叫禾。十年前的邮戳了。',
        '我送不出去，可我不想它一直躺在袋底。'],
      ['禾。这封信就是写给他的 ——「北边，禾收」。',
        '他走之前交给我的，说等他回来再给。',
        '我等了十年。他大概不会回来了。'],
      ['地图上画的地方，比北境还北。',
        '那封信……我送不出去了。你替我拿着吧。',
        '替他把信送到，就当是我送的。'],
      ['你们真去了。',
        '……送到了吗？',
        '算了。回来就好。'],
      ['信我送出去了。收件人写着「禾」，地址写着「北边」。',
        '回执我留着了 —— 上面画了一道光。',
        '那些一直寄不出去的信，终于可以继续送了。'],
      ['今年要给每个人寄一张。一张都不能少。',
        '地址我都记得，一个都没忘。',
        '包括「北边」那一张。']
    ],

    /* ---------------- 面包师 · 麦香：炉火就是她的天气 ---------------- */
    baker: [
      ['炉子最近总烧不旺。风从北边来的时候，火就低头。',
        '你说，风里是不是带着什么东西？',
        '面团发不起来。这天气，连酵母都懒。'],
      ['北边亮起来以后，我这炉子反倒更低了。',
        '像是有什么在吸走热气。',
        '你们要是出门，带两块面包。冷的夜里顶饿。'],
      ['面包我给你们留着。走之前来拿。',
        '路上别省着吃。',
        '炉火我盯着，短不了。'],
      ['那孩子走的那天，炉火特别旺。像是替他送行。',
        '他买了一个最便宜的面包，说要在路上吃。',
        '我没收钱。'],
      ['这几天镇上怎么越来越暗了……我的炉子都快看不见火了。',
        '可是奇怪，面包还是香的。',
        '你们要出远门？那我多烤一炉。'],
      ['你们回来之前，我一直在看天。',
        '火苗刚才跳了一下，往北边偏。',
        '……是回来了吧？'],
      ['炉火自己就旺了！你闻，是不是有点甜？',
        '炉火还在，阳光也回来了。',
        '今天这炉，我多放了糖。'],
      ['第一炉已经出炉了，热气糊了半条街。',
        '圣诞夜的面包，得提前一天发面。',
        '今年要烤的，比往年都多。']
    ],

    /* ---------------- 咖啡店老板娘：安静地看人 ---------------- */
    barista: [
      ['来杯热的？这几天客人都不肯走。',
        '天越暗，店里越挤。人大概都怕一个人待着。',
        '你要坐最里面那个位子吗？……那个位子有人坐惯了。'],
      ['北边有光，客人们都在说。',
        '我不太信这些。可我这几天总往窗外看。',
        '热可可在炉子上，自己倒。'],
      ['那位子一直空着。我每天都擦。',
        '他以前每天来，坐最里面那个，点最便宜的。',
        '有一回他问我：「如果一样东西不见了，是不是它自己走的？」'],
      ['禾。你们说的是他吧。',
        '他没跟我告别。就把杯子洗了，放回架子上。',
        '我一直在等他把那个杯子再拿下来。'],
      ['极光盒子？他跟我提过一次。他说那里面装的不是光，是「答应」。',
        '答应谁？他没说。',
        '……大概是答应过什么人，要带光回来。'],
      ['你们看起来像走了很远。',
        '先坐下吧。热的，不要钱。',
        '有些话，等你们缓过来再说。'],
      ['今天第一杯，我请。',
        '阳光照进来的时候，杯子上的水痕是金色的。',
        '我把最里面那个位子擦干净了。'],
      ['圣诞夜店里不打烊。',
        '热可可管够，谁来都有。',
        '今年想多煮一壶。']
    ],

    /* ---------------- 小精灵：风车的约定 ---------------- */
    elf: [
      ['天怎么一天比一天短呀？我早上起来三次了。',
        '是不是有人把太阳藏起来了？',
        '我不敢一个人走夜路。'],
      ['北边的林子里有光！我看见了！',
        '可是娘说那儿不让人看。',
        '你们会去看吗？'],
      ['你们真的要往北走吗？',
        '那你帮我看看，那边有没有风车。',
        '禾哥哥答应回来帮我修风车的。'],
      ['禾哥哥！你们见到他了吗？',
        '他会修风车。他答应回来帮我修的。',
        '……他是不是忘了？'],
      ['你们要去把光带回来吗？',
        '那你们要快点回来。',
        '我把风车擦干净了，等他回来修。'],
      ['天上那个，是极光吗？',
        '好漂亮。漂亮得有点想哭。',
        '你们回来啦。'],
      ['亮了亮了！我要去告诉所有人！',
        '他说过会回来修好风车……也许这次真的能等到他。',
        '太阳晒在脸上，暖的！'],
      ['彩带我来挂！我够得着！',
        '今年圣诞老人会不会多给我一份礼物？',
        '我把风车也挂上彩带了。']
    ],

    /* ---------------- 牧羊女 · 小禾：动物比人先知道 ---------------- */
    shepherd: [
      ['羊群不肯往北走。它们比人灵。',
        '这几天它们挤在一起睡，挤得紧紧的。',
        '天黑得太快了，草都来不及长。'],
      ['北边有光。羊群全都朝着那边看。',
        '它们不怕那个光。它们怕的是光后面的东西。',
        '你要去，就带上火。'],
      ['羊奶这几天特别少。它们心里不踏实。',
        '动物知道要出事，人总是最后一个知道。',
        '需要毛的话，自己剪。别剪太多。'],
      ['禾……你们说的是那个种树的人吧。',
        '他走之前来看过羊。摸了摸每一只的头。',
        '他说：等它们不怕了，我就回来。'],
      ['去吧。羊我替你们看着。',
        '路上冷。羊毛围巾带上。',
        '别学他，去了就不回来。'],
      ['羊群刚才叫了。它们知道你们回来了。',
        '……天是不是要变了？',
        '它们往南边走了。'],
      ['羊群往南走了。它们知道冬天要过去了。',
        '今早的草上有露水，好久没见过了。',
        '光回来，草就会长。'],
      ['羊圈我扫干净了。',
        '圣诞夜给它们也加点料吧。',
        '这一年，它们也熬过来了。']
    ],

    /* ---------------- 雪人先生：怕化，但也怕黑 ---------------- */
    snowman: [
      ['……（雪人先生朝着北边，一动不动。）',
        '别站太近，我最近有点怕化……',
        '天这么暗，我反倒不那么怕了。奇怪。'],
      ['……（雪人先生的帽子上，落了一层新的雪。）',
        '北边那个光，是不是在叫我？',
        '我不去。我还想多站几天。'],
      ['你们俩最近总往北边跑。',
        '记得回来啊。我数着日子呢。',
        '我数到第十七天了。'],
      ['……（雪人先生朝北边，低下了头。）',
        '那个叫禾的，是不是也怕化？',
        '人啊，总觉得自己不会化。'],
      ['……（雪人先生的影子，比昨天更长。）',
        '你们要出远门？',
        '那……回来的时候，记得我还是这个样子。'],
      ['……（雪人先生一动不动，好像在听什么。）',
        '天上在响。',
        '不是雷。是光。'],
      ['……（雪人先生在阳光里，慢慢变矮了一点。）',
        '这么亮的天……我压力真的很大。',
        '但为了庆祝，化了也值！'],
      ['……（雪人先生努力挺直了一点。）',
        '再撑几天。撑到圣诞夜。',
        '到时候你们别看我。']
    ]
  };

  /* ============================================================
   * 1.5 远方来信 / 极夜降临（v5.4 隐藏剧情线）
   * ------------------------------------------------------------
   * 这封信是整条线的入口：不是任务列表弹出的，是阿信在邮局门口叫住你。
   * 文本只在这里写一次，game.js 负责触发与写存档。
   * ============================================================ */
  var LETTER = {
    who: '邮差 · 阿信',
    lines: [
      '等等 —— 你们来得正好。',
      '今早理邮袋的时候，多了这一封。没有寄件人，邮戳是北边的。',
      '我送了十年信，第一次见这种邮戳。上面只盖了一个字：禾。',
      '里面就一页纸，字很轻：\n「光要走了。北边的门会开。别一个人来。」',
      '……这个字我认得。十年前他走的那天，给我留过一张便条，也是这么写的。',
      '这封信我送不出去 —— 收件地址只写了「北边」。\n你们拿着吧。顺便，去和镇上的人说一声。他们该知道了。'
    ],
    after: [
      '（信纸很薄，边角有一点松木味。背面还有一行更小的字：）',
      '「树长到最高的时候，抬头看。」'
    ]
  };

  var POLAR_LINES = {
    kicker: 'THE POLAR NIGHT',
    title: '极夜降临',
    sub: '从今天起，小镇不再天亮。',
    body: '不是日食，也不是暴雪。\n是光，一点一点地退回了它来的地方。',
    hint: '北边的雪地上，多了一圈发蓝的符文。'
  };

  /* 给 game.js 用：这一档该说哪些话 */
  function npcTalk(w, id) {
    var tier = tierOf(w);
    if (tier < 0) return null;
    var pool = TALK[id] && TALK[id][tier];
    if (!pool || !pool.length) return null;
    return { tier: tier, pool: pool, key: id + ':' + tier };
  }
  /* 兼容旧接口：返回这一档的整池 */
  function npcLines(id, tier) {
    if (tier == null || tier < 0) return null;
    var t = Math.max(0, Math.min(7, Math.floor(tier || 0)));
    return (TALK[id] && TALK[id][t]) || null;
  }

  /* ============================================================
   * 2. 冰岛：极光演出
   * ------------------------------------------------------------
   * 场景顺序（非常重要）：
   *   夜空位图 → 极光（会被山挡住的） → 山脊位图（不透明，压住极光下缘）
   *   → 山脊轮廓光 → 冰湖倒影 → 极光盒光柱 → 两个小人 → 暗角
   *
   * 为什么把山放在极光之后：
   *   这样「极光从山后面升起来」是画出来的，不是靠遮罩糊出来的。
   *   第一道极光的下缘被山脊咬住，才有"从远处山后出现"的感觉。
   *
   * 为什么不用逐列渐变画光带：
   *   那是"栅栏"的成因。这里用「一条完整飘带路径 + 沿路径的竖直渐变裁切 +
   *   带倾斜的细光帘」，褶皱靠厚度函数做，不靠加光带数量。
   * ============================================================ */
  var AURORA_SECONDS = 32;          // 演出总时长（game.js 用这个数起 rAF）
  var SCENE_SCALE = 1.18;           // 场景比屏幕大 18%，给镜头拉远留余量

  var CACHE = {};
  var CACHE_ORDER = [];
  function cachePut(key, val) {
    CACHE[key] = val;
    CACHE_ORDER.push(key);
    /* 一张夜空 + 一张山湖 + 一张暗角 + 两个小人 = 5；留到 8 给横竖屏切换留余量 */
    while (CACHE_ORDER.length > 8) {
      var k = CACHE_ORDER.shift();
      if (k !== key) delete CACHE[k];
    }
  }

  /* 柔光贴图：极光折痕、盒子光池都用它。
     以前每帧 new 十几个 RadialGradient，手机上掉帧；现在一种颜色只烘一次。 */
  var GLOW = {};
  function glowSprite(col) {
    var key = col.join(',');
    if (GLOW[key]) return GLOW[key];
    if (typeof document === 'undefined') return null;
    var size = 64;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size * 2;
    var g = cv.getContext('2d');
    if (!g) return null;
    var grd = g.createRadialGradient(size, size, 0, size, size, size);
    grd.addColorStop(0, rgba(col, 1));
    grd.addColorStop(0.45, rgba(col, 0.38));
    grd.addColorStop(1, rgba(col, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size * 2, size * 2);
    GLOW[key] = cv;
    return cv;
  }

  /* 确定性伪随机（同一尺寸每次烘出来一模一样） */
  function prng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function sstep(a, b, x) {
    if (b === a) return x >= b ? 1 : 0;
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a < 0 ? 0 : a).toFixed(3) + ')'; }

  /* ---------- 山脊：折线山峰（低多边形，和像素画风一致） ---------- */
  /* 山脊：不等宽、不等距的峰 + 谷 + 肩峰。
     等距三角形一眼就是纸板，真正的山脉是"大峰带小峰、宽窄不一"。 */
  function makeRidge(seed, n, lo, hi, base) {
    var r = prng(seed);
    var pts = [{ t: 0, y: base - hi * 0.09 }];
    var t = 0.01;
    for (var i = 0; i < n; i++) {
      var w = 0.07 + r() * 0.17;
      /* 峰高：用两个随机数叠出来，让"高耸的主峰"和"低矮的山头"差异拉大，
         别都挤在 45%~100% 的中段，否则远看还是一排差不多高的三角形。 */
      var ph = hi * (0.22 + 0.78 * Math.pow(r(), 1.6));
      var pk = Math.min(0.97, t + w * 0.5);
      pts.push({ t: Math.min(0.97, t + w * 0.10), y: base - hi * (0.03 + r() * 0.09) });
      pts.push({ t: pk, y: base - ph });
      if (r() > 0.42) {
        pts.push({ t: Math.min(0.975, pk + w * 0.34), y: base - ph * (0.48 + 0.30 * r()) });
      }
      t = pk + w * 0.42 + r() * 0.04;
      if (t > 0.95) break;
    }
    pts.push({ t: 1, y: base - hi * 0.07 });
    for (var k = 0; k < pts.length; k++) {
      if (pts[k].y < base - hi) pts[k].y = base - hi;
      if (pts[k].y > base - lo * 0.6) pts[k].y = base - lo * 0.6;
    }
    return pts;
  }
  function ridgePath(g, pts, SW, SH, base, closeY) {
    g.beginPath();
    g.moveTo(0, closeY);
    for (var i = 0; i < pts.length; i++) g.lineTo(pts[i].t * SW, pts[i].y);
    g.lineTo(SW, closeY);
    g.closePath();
  }
  function ridgeLine(g, pts, SW) {
    g.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (i === 0) g.moveTo(p.t * SW, p.y); else g.lineTo(p.t * SW, p.y);
    }
  }

  /* ---------- 静态层：夜空 / 山与冰湖 / 暗角 ---------- */
  function bakeSize(SW, SH) {
    var dpr = (typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1);
    dpr = Math.min(2, Math.max(1, dpr));
    /* 像素上限：一张背景超过约 320 万像素就降采样，手机上别把内存吃光 */
    var maxPx = 3.2e6;
    if (SW * SH * dpr * dpr > maxPx) dpr = Math.max(1, Math.sqrt(maxPx / (SW * SH)));
    return dpr;
  }

  function bakeScene(SW, SH, tag) {
    var key = tag + ':' + Math.round(SW) + 'x' + Math.round(SH);
    if (CACHE[key]) return CACHE[key];
    if (typeof document === 'undefined') return null;
    var dpr = bakeSize(SW, SH);
    var cv = document.createElement('canvas');
    if (!cv || !cv.getContext) return null;
    cv.width = Math.max(2, Math.round(SW * dpr));
    cv.height = Math.max(2, Math.round(SH * dpr));
    var g = cv.getContext('2d');
    if (!g) return null;
    g.scale(dpr, dpr);

    var HY = SH * 0.665;             // 地平线
    var rec = { cv: cv, dpr: dpr, SW: SW, SH: SH, HY: HY };

    /* ===== 夜空 ===== */
    var sky = g.createLinearGradient(0, 0, 0, HY + SH * 0.02);
    sky.addColorStop(0, '#01030a');
    sky.addColorStop(0.22, '#040a18');
    sky.addColorStop(0.46, '#071226');
    sky.addColorStop(0.70, '#0a1c33');
    sky.addColorStop(0.88, '#0e2a41');
    sky.addColorStop(1, '#13405a');
    g.fillStyle = sky;
    g.fillRect(0, 0, SW, HY + 4);

    /* 银河：一条很淡的斜带，不要抢极光的戏 */
    g.save();
    g.translate(SW * 0.5, SH * 0.30);
    g.rotate(-0.38);
    var mw = g.createLinearGradient(0, -SH * 0.10, 0, SH * 0.10);
    mw.addColorStop(0, 'rgba(150,180,235,0)');
    mw.addColorStop(0.45, 'rgba(150,180,235,.075)');
    mw.addColorStop(0.55, 'rgba(190,205,240,.085)');
    mw.addColorStop(1, 'rgba(150,180,235,0)');
    g.fillStyle = mw;
    g.fillRect(-SW, -SH * 0.10, SW * 2, SH * 0.20);
    g.restore();

    /* 星：越靠地平线越稀越暗；少数几颗带十字芒和冷暖色差 */
    var rnd = prng(20261103);
    var starN = Math.round(SW * 0.42);
    for (var i = 0; i < starN; i++) {
      var sx = rnd() * SW;
      var sy = Math.pow(rnd(), 0.72) * HY * 0.96;
      var fade = clamp01(1 - sy / (HY * 0.98));
      var sa = (0.10 + rnd() * 0.62) * (0.25 + 0.75 * fade);
      var sr = rnd() > 0.94 ? 1.55 : (rnd() > 0.62 ? 1.0 : 0.62);
      var warm = rnd();
      var col = warm > 0.88 ? '255,228,196' : (warm > 0.72 ? '196,222,255' : '228,240,255');
      g.fillStyle = 'rgba(' + col + ',' + sa.toFixed(3) + ')';
      g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill();
      if (sr > 1.4 && fade > 0.4) {
        g.strokeStyle = 'rgba(' + col + ',' + (sa * 0.40).toFixed(3) + ')';
        g.lineWidth = 0.7;
        g.beginPath();
        g.moveTo(sx - 4, sy); g.lineTo(sx + 4, sy);
        g.moveTo(sx, sy - 4); g.lineTo(sx, sy + 4);
        g.stroke();
      }
    }

    cachePut(key, rec);
    return rec;
  }

  /* 湖岸线：必须是一条有起伏的曲线。
     第一版是"到 LAKE 为止的整块矩形"，屏幕上会出现一条横贯画面的直线，
     一眼就看出是贴图接缝，冰湖也就不像湖了。 */
  function lakeTopAt(x, SW, SH) {
    var u = x / SW;
    return SH * 0.796
      + Math.sin(u * 5.1 + 0.55) * SH * 0.011
      + Math.sin(u * 10.7 + 2.20) * SH * 0.0052
      + Math.sin(u * 21.3 + 4.10) * SH * 0.0022;
  }
  function lakeTopPath(g, SW, SH) {
    var N = 40;
    g.beginPath();
    for (var i = 0; i <= N; i++) {
      var x = (i / N) * SW;
      var y = lakeTopAt(x, SW, SH);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }

  function bakeLand(SW, SH, HY) {
    var key = 'land:' + Math.round(SW) + 'x' + Math.round(SH);
    if (CACHE[key]) return CACHE[key];
    if (typeof document === 'undefined') return null;
    var dpr = bakeSize(SW, SH);
    var cv = document.createElement('canvas');
    if (!cv || !cv.getContext) return null;
    cv.width = Math.max(2, Math.round(SW * dpr));
    cv.height = Math.max(2, Math.round(SH * dpr));
    var g = cv.getContext('2d');
    if (!g) return null;
    g.scale(dpr, dpr);

    /* 峰数不多但高低错落，才有山脉的节奏；太多小尖会变成锯齿噪声 */
    var far = makeRidge(90125, 9, SH * 0.030, SH * 0.140, HY);
    var mid = makeRidge(4489, 6, SH * 0.010, SH * 0.050, HY + SH * 0.006);
    var rnd = prng(7741);

    /* --- 远山：深冷色，山脊上挂一层薄雪 --- */
    ridgePath(g, far, SW, SH, HY, HY + SH * 0.10);
    var fg = g.createLinearGradient(0, HY - SH * 0.13, 0, HY + SH * 0.05);
    fg.addColorStop(0, '#091625');
    fg.addColorStop(0.72, '#07111c');
    fg.addColorStop(1, '#0a1a28');
    g.fillStyle = fg;
    g.fill();

    g.save();
    ridgePath(g, far, SW, SH, HY, HY + SH * 0.10);
    g.clip();
    /* 雪帽：每座峰顶压一小片浅色，顺着坡面斜下去 —— 这是"雪山"的关键。
       注意只压峰顶往下 30%，压到山脚整座山就糊成一个雪包。 */
    for (var f = 1; f < far.length - 1; f++) {
      var pf = far[f];
      var pl = far[f - 1], pr2 = far[f + 1];
      if (!(pf.y < pl.y && pf.y < pr2.y)) continue;      // 只处理局部最高点
      var hgt = HY - pf.y;
      if (hgt < SH * 0.045) continue;
      var px = pf.t * SW;
      var lx = px + (pl.t * SW - px) * 0.30;
      var rx = px + (pr2.t * SW - px) * 0.30;
      var ly = pf.y + (pl.y - pf.y) * 0.30;
      var ry = pf.y + (pr2.y - pf.y) * 0.30;
      g.fillStyle = 'rgba(198,224,246,.13)';
      g.beginPath();
      g.moveTo(px, pf.y);
      g.lineTo(rx, ry);
      g.lineTo(px + (rx - px) * 0.55, ry - hgt * 0.10);
      g.lineTo(px + (lx - px) * 0.55, ly - hgt * 0.08);
      g.lineTo(lx, ly);
      g.closePath();
      g.fill();
    }
    /* 山脊细光：一条 1.5px 的雪线，不能粗，粗了整座山就变成雪包 */
    ridgeLine(g, far, SW);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(206,232,252,.20)';
    g.lineWidth = 1.6;
    g.stroke();
    /* 山脚的雾：把山和雪原分开，远山才有"远"的感觉 */
    var haze2 = g.createLinearGradient(0, HY - SH * 0.05, 0, HY + SH * 0.012);
    haze2.addColorStop(0, 'rgba(48,96,128,0)');
    haze2.addColorStop(0.62, 'rgba(52,104,136,.18)');
    haze2.addColorStop(1, 'rgba(58,116,146,.30)');
    g.fillStyle = haze2;
    g.fillRect(0, HY - SH * 0.05, SW, SH * 0.062);
    g.restore();

    /* --- 中山：更近的一层剪影，把纵深再推一格 --- */
    ridgePath(g, mid, SW, SH, HY, HY + SH * 0.08);
    var mg = g.createLinearGradient(0, HY - SH * 0.06, 0, HY + SH * 0.02);
    mg.addColorStop(0, '#09141f');
    mg.addColorStop(1, '#0c1c2b');
    g.fillStyle = mg;
    g.fill();
    g.save();
    ridgePath(g, mid, SW, SH, HY, HY + SH * 0.08);
    g.clip();
    ridgeLine(g, mid, SW);
    g.strokeStyle = 'rgba(150,200,228,.16)';
    g.lineWidth = 1.3;
    g.stroke();
    g.restore();

    /* --- 雪原：地平线往下到湖岸。夜里雪比水亮一档，别画反了 --- */
    /* 底部不用 fillRect 直到底边 —— 那样会留下一条横贯画面的水平边界。
       改成用湖岸线路径裁切，雪原的下缘就是那条有起伏的岸线，接缝自然消失。 */
    var snowTop = lakeTopAt(0, SW, SH);
    g.save();
    g.beginPath();
    g.moveTo(0, HY);
    g.lineTo(SW, HY);
    g.lineTo(SW, SH * 0.84);
    for (var sx = 40; sx >= 0; sx--) {
      g.lineTo((sx / 40) * SW, lakeTopAt((sx / 40) * SW, SW, SH) + SH * 0.004);
    }
    g.closePath();
    g.clip();
    var snow = g.createLinearGradient(0, HY, 0, snowTop + SH * 0.02);
    snow.addColorStop(0, '#23455a');
    snow.addColorStop(0.42, '#2a5067');
    snow.addColorStop(1, '#2f5b74');
    g.fillStyle = snow;
    g.fillRect(0, HY, SW, snowTop + SH * 0.02 - HY);
    /* 雪原上的起伏：非常淡的横向雪脊，让平地有远近 */
    for (var s = 0; s < 9; s++) {
      var sy = HY + (s + 0.5) / 9 * (snowTop - HY);
      g.fillStyle = s % 2 ? 'rgba(226,242,255,.055)' : 'rgba(8,18,28,.085)';
      g.beginPath();
      g.ellipse(SW * (0.1 + rnd() * 0.8), sy, SW * (0.16 + rnd() * 0.2), SH * 0.008, 0, 0, 7);
      g.fill();
    }
    g.restore();

    /* --- 冰湖：比雪地暗，才有"冰是水冻的"那层意思 --- */
    var lake = g.createLinearGradient(0, snowTop, 0, SH);
    lake.addColorStop(0, '#1b3d54');
    lake.addColorStop(0.22, '#173650');
    lake.addColorStop(0.62, '#132d43');
    lake.addColorStop(1, '#0f2637');
    g.beginPath();
    lakeTopPath(g, SW, SH);
    g.lineTo(SW, SH);
    g.lineTo(0, SH);
    g.closePath();
    g.fillStyle = lake;
    g.fill();

    /* 远岸：一条压亮的雪岸 + 碎冰，把湖和雪地真正分开 */
    g.save();
    lakeTopPath(g, SW, SH);
    g.strokeStyle = 'rgba(226,246,255,.34)';
    g.lineWidth = 2.0;
    g.stroke();
    g.strokeStyle = 'rgba(120,180,210,.30)';
    g.lineWidth = 6;
    g.stroke();
    g.restore();
    for (var b = 0; b < 30; b++) {
      var bx = rnd() * SW;
      var by = lakeTopAt(bx, SW, SH) + (rnd() - 0.5) * SH * 0.008;
      g.fillStyle = 'rgba(232,248,255,' + (0.10 + rnd() * 0.22).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(bx, by, 3 + rnd() * 13, 1.2 + rnd() * 2.2, 0, 0, 7);
      g.fill();
    }

    /* 冰面：大块的薄冰与裂纹 */
    for (var c2 = 0; c2 < 18; c2++) {
      var cx = rnd() * SW;
      var cy = lakeTopAt(cx, SW, SH) + SH * 0.02 + rnd() * SH * 0.15;
      var cw = SW * (0.02 + rnd() * 0.07);
      g.fillStyle = 'rgba(206,232,255,' + (0.030 + rnd() * 0.050).toFixed(3) + ')';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + cw * 0.55, cy - cw * 0.05);
      g.lineTo(cx + cw, cy + cw * 0.04);
      g.lineTo(cx + cw * 0.4, cy + cw * 0.09);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(226,246,255,.16)';
    g.lineWidth = 0.9;
    for (var k2 = 0; k2 < 15; k2++) {
      var kx = rnd() * SW, ky = lakeTopAt(kx, SW, SH) + SH * 0.02 + rnd() * SH * 0.14;
      g.beginPath();
      g.moveTo(kx, ky);
      g.lineTo(kx + 12 + rnd() * 30, ky + (rnd() - 0.5) * 6);
      g.lineTo(kx + 30 + rnd() * 40, ky + (rnd() - 0.5) * 10);
      g.stroke();
    }

    /* 画面最底一条更暗的冰缘，把人物托住 */
    var foot = g.createLinearGradient(0, SH * 0.92, 0, SH);
    foot.addColorStop(0, 'rgba(6,14,24,0)');
    foot.addColorStop(1, 'rgba(4,10,18,.50)');
    g.fillStyle = foot;
    g.fillRect(0, SH * 0.92, SW, SH * 0.08);

    var rec = { cv: cv, dpr: dpr, far: far, mid: mid, LAKE: snowTop };
    cachePut(key, rec);
    return rec;
  }

  /* ---------- v5.2 前景层 ----------
     单独烘一张，画在人物**之后** —— 这样才是真的"前景"。
     压得很暗，只留一条被极光照亮的雪边：不抢人物，但把视线框在中间。 */
  function bakeFore(SW, SH) {
    var key = 'fore:' + Math.round(SW) + 'x' + Math.round(SH);
    if (CACHE[key]) return CACHE[key];
    if (typeof document === 'undefined') return null;
    /* 半分辨率就够：前景是压暗的大色块 + 一条雪边，没有细节 */
    var dpr = bakeSize(SW, SH) * 0.55;
    var cv = document.createElement('canvas');
    if (!cv || !cv.getContext) return null;
    cv.width = Math.max(2, Math.round(SW * dpr));
    cv.height = Math.max(2, Math.round(SH * dpr));
    var g = cv.getContext('2d');
    if (!g) return null;
    g.scale(dpr, dpr);
    var rnd = prng(5150);

    /* v5.2 前景：两侧的冰崖 + 碎冰
       只有「前 / 中 / 后」三层都在，画面才有纵深。
       前景压得很暗（几乎全黑），只留一条被极光照亮的雪边 ——
       这样它不会抢人物，但会把视线框在中间。 */
    function foreBand(dir) {
      var w0 = SW * (0.30 + 0.06 * (dir > 0 ? 1 : 0));
      var yTop = SH * (dir > 0 ? 0.955 : 0.965);
      g.beginPath();
      if (dir < 0) {
        g.moveTo(0, SH);
        g.lineTo(0, yTop + SH * 0.012);
        for (var i = 1; i <= 7; i++) {
          var u = i / 7;
          g.lineTo(w0 * u, yTop - SH * 0.022 * Math.sin(u * 3.1 + 0.6) * (1 - u * 0.5));
        }
        g.lineTo(w0, SH);
      } else {
        g.moveTo(SW, SH);
        g.lineTo(SW, yTop + SH * 0.010);
        for (var j = 1; j <= 7; j++) {
          var u2 = j / 7;
          g.lineTo(SW - w0 * u2, yTop - SH * 0.020 * Math.sin(u2 * 3.4 + 1.9) * (1 - u2 * 0.5));
        }
        g.lineTo(SW - w0, SH);
      }
      g.closePath();
      var fg2 = g.createLinearGradient(0, yTop - SH * 0.03, 0, SH);
      fg2.addColorStop(0, 'rgba(10,22,36,.86)');
      fg2.addColorStop(0.45, 'rgba(5,12,22,.96)');
      fg2.addColorStop(1, 'rgba(2,6,12,1)');
      g.fillStyle = fg2;
      g.fill();
      /* 崖顶那一条被极光洗亮的雪边 */
      g.strokeStyle = 'rgba(176,224,244,.30)';
      g.lineWidth = 1.4;
      g.stroke();
    }
    foreBand(-1);
    foreBand(1);
    /* 前景碎冰：几块很小的冰角，别多 */
    for (var fb = 0; fb < 7; fb++) {
      var fbx = SW * (fb < 4 ? 0.02 + rnd() * 0.22 : 0.76 + rnd() * 0.22);
      var fby = SH * (0.965 + rnd() * 0.03);
      g.fillStyle = 'rgba(120,168,196,' + (0.10 + rnd() * 0.10).toFixed(3) + ')';
      g.beginPath();
      g.moveTo(fbx, fby);
      g.lineTo(fbx + 5 + rnd() * 7, fby - 4 - rnd() * 5);
      g.lineTo(fbx + 12 + rnd() * 9, fby);
      g.closePath();
      g.fill();
    }


    var rec = { cv: cv, dpr: dpr };
    cachePut(key, rec);
    return rec;
  }

  function bakeVignette(SW, SH) {
    var key = 'vig:' + Math.round(SW) + 'x' + Math.round(SH);
    if (CACHE[key]) return CACHE[key];
    if (typeof document === 'undefined') return null;
    var dpr = bakeSize(SW, SH);
    var cv = document.createElement('canvas');
    cv.width = Math.max(2, Math.round(SW * dpr));
    cv.height = Math.max(2, Math.round(SH * dpr));
    var g = cv.getContext('2d');
    if (!g) return null;
    g.scale(dpr, dpr);
    var vg = g.createRadialGradient(SW / 2, SH * 0.60, Math.min(SW, SH) * 0.30,
      SW / 2, SH * 0.60, Math.max(SW, SH) * 0.80);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.62, 'rgba(2,6,14,.20)');
    vg.addColorStop(1, 'rgba(2,5,12,.72)');
    g.fillStyle = vg;
    g.fillRect(0, 0, SW, SH);
    var rec = { cv: cv, dpr: dpr };
    cachePut(key, rec);
    return rec;
  }

  /* ---------- 两个小人：烘一张图 + 一张轮廓光遮罩 ---------- */
  function bakeFigure(which, pxH) {
    var key = 'fig:' + which + ':' + Math.round(pxH);
    if (CACHE[key]) return CACHE[key];
    if (typeof document === 'undefined' || !window.Chars || !window.Chars.frameCanvas) return null;
    var src;
    try { src = window.Chars.frameCanvas(which === 'a' ? 'm' : 'f', 1, 0, 0, 'winter'); } catch (e) { return null; }
    if (!src) return null;

    var aspect = src.width / src.height;
    var dpr = Math.min(2, (window.devicePixelRatio || 1));
    var w = pxH * aspect;
    function mk(fill) {
      var cv = document.createElement('canvas');
      cv.width = Math.max(2, Math.round(w * dpr));
      cv.height = Math.max(2, Math.round(pxH * dpr));
      var g = cv.getContext('2d');
      if (!g) return null;
      g.imageSmoothingEnabled = true;
      g.drawImage(src, 0, 0, cv.width, cv.height);
      if (fill) {
        g.globalCompositeOperation = 'source-in';
        var grd = g.createLinearGradient(0, 0, 0, cv.height);
        grd.addColorStop(0, 'rgba(186,255,232,1)');
        grd.addColorStop(0.55, 'rgba(120,232,236,.95)');
        grd.addColorStop(1, 'rgba(70,170,210,.75)');
        g.fillStyle = grd;
        g.fillRect(0, 0, cv.width, cv.height);
      }
      return cv;
    }
    var rec = { body: mk(false), rim: mk(true), w: w, h: pxH, aspect: aspect };
    cachePut(key, rec);
    return rec;
  }

  /* ---------- 极光飘带 ---------- */
  var RIBBONS = [
    { y: 0.272, amp: 0.032, th: 0.086, sp: 1.00, ph: 0.0, col: [86, 255, 156], a: 0.34, at: 0.30 },
    { y: 0.338, amp: 0.040, th: 0.110, sp: 0.74, ph: 1.7, col: [58, 226, 178], a: 0.26, at: 0.36 },
    { y: 0.222, amp: 0.026, th: 0.064, sp: 1.26, ph: 3.2, col: [96, 176, 255], a: 0.22, at: 0.42 },
    { y: 0.404, amp: 0.030, th: 0.074, sp: 0.60, ph: 5.1, col: [162, 116, 255], a: 0.18, at: 0.47 },
    { y: 0.312, amp: 0.023, th: 0.044, sp: 1.52, ph: 2.4, col: [255, 132, 196], a: 0.10, at: 0.55 }
  ];

  function ribbonBaseY(r, SH, HY, grow) {
    var rest = r.y * SH;
    var start = HY - SH * 0.012;
    return start + (rest - start) * grow;
  }
  function ribbonY(r, x, SW, SH, HY, t, grow) {
    var u = x / SW;
    var base = ribbonBaseY(r, SH, HY, grow);
    var wave = (Math.sin(u * 5.1 + r.ph + t * 0.105 * r.sp) * 0.50
      + Math.sin(u * 9.7 - t * 0.072 * r.sp + r.ph * 1.7) * 0.30
      + Math.sin(u * 17.3 + t * 0.128 * r.sp + r.ph * 0.6) * 0.21
      + Math.sin(u * 28.9 - t * 0.165 * r.sp + r.ph * 2.3) * 0.11);
    return base + wave * r.amp * SH * (0.35 + 0.65 * grow);
  }
  function ribbonTh(r, x, SW, SH, t, grow) {
    var u = x / SW;
    /* 厚度变化要大：极光有的地方薄得像一层纱，有的地方卷起来厚成一条带。
       这里是"褶皱"的真正来源 —— 只靠加光带数量是做不出这种疏密的。 */
    var f = 0.52 + 0.48 * Math.sin(u * 7.3 + r.ph * 2.1 - t * 0.165 * r.sp)
      + 0.20 * Math.sin(u * 13.1 + t * 0.225 * r.sp + r.ph)
      + 0.12 * Math.sin(u * 21.7 - t * 0.16 * r.sp);
    f = 0.18 + 0.82 * clamp01(f);
    return r.th * SH * f * (0.42 + 0.58 * grow);
  }
  function ribbonPath(g, r, SW, SH, HY, t, grow, shrinkTop) {
    var N = 46, i, x, y;
    g.beginPath();
    for (i = 0; i <= N; i++) {
      x = (i / N) * SW;
      y = ribbonY(r, x, SW, SH, HY, t, grow);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    for (i = N; i >= 0; i--) {
      x = (i / N) * SW;
      y = ribbonY(r, x, SW, SH, HY, t, grow) - ribbonTh(r, x, SW, SH, t, grow) * (shrinkTop || 1);
      g.lineTo(x, y);
    }
    g.closePath();
  }

  function drawRibbon(g, r, SW, SH, HY, t, grow, alpha) {
    if (alpha <= 0.004 || grow <= 0.01) return;
    var col = r.col;
    var A = alpha;
    var ph = r.ph;

    /* 1) 飘带主体：沿路径裁切的竖直渐变。
       上半部几乎全透明 —— 极光的"实体"只是下缘那一条，
       上面那一大片是光帘，不是一层有边界的色块（这是第一版"像小山"的原因）。 */
    var y0 = ribbonBaseY(r, SH, HY, grow) + r.th * SH * 0.06;
    var y1 = y0 - r.th * SH * 1.55;
    var lg = g.createLinearGradient(0, y0, 0, y1);
    lg.addColorStop(0, rgba(col, A * 0.85));
    lg.addColorStop(0.12, rgba(col, A * 0.34));
    lg.addColorStop(0.38, rgba(col, A * 0.10));
    lg.addColorStop(0.72, rgba(col, A * 0.025));
    lg.addColorStop(1, rgba(col, 0));
    /* 直接 fill 这条飘带路径就够 —— 以前是 clip + fillRect，
       结果一样，但每帧多 5 次复杂路径裁切（手机上很贵）。 */
    g.fillStyle = lg;
    ribbonPath(g, r, SW, SH, HY, t, grow, 1);
    g.fill();

    /* 2) 光帘：**不裁切**，从下缘往上飘出飘带之外，
       长度差别很大 —— 这是"极光"和"栅栏"的分界线。
       每根都带一点倾斜，像被同一阵风推着。 */
    var N = Math.max(40, Math.min(160, Math.round(SW / 8)));
    for (var i = 0; i < N; i++) {
      var u = (i + 0.5) / N;
      var jit = Math.sin(i * 12.9898 + ph * 78.233) * 43758.5453;
      u += ((jit - Math.floor(jit)) - 0.5) * (1.6 / N);
      var x = u * SW;
      var yb = ribbonY(r, x, SW, SH, HY, t, grow);
      var th = ribbonTh(r, x, SW, SH, t, grow);
      var lf = 0.5 + 0.5 * Math.sin(i * 0.37 + t * 0.85 * r.sp + ph);
      var len = th * (0.35 + 1.35 * lf * lf);            // 平方：大部分短，少数特别长
      var lean = Math.sin(u * 6.4 + t * 0.22 * r.sp + ph) * th * 0.34;
      var a1 = A * (0.10 + 0.26 * Math.abs(Math.sin(i * 0.21 + t * 1.05 + ph)));
      if (a1 < 0.008) continue;
      g.fillStyle = rgba(col, a1);
      g.beginPath();
      g.moveTo(x - 1.0, yb + 1);
      g.lineTo(x + 1.0, yb + 1);
      g.lineTo(x + lean + 1.35, yb - len);
      g.lineTo(x + lean - 1.35, yb - len);
      g.closePath();
      g.fill();
    }

    /* 3) 下缘亮芯：极光的"折边"就在这里，必须比主体亮一档。 */
    var N2 = 46;
    g.beginPath();
    for (var k = 0; k <= N2; k++) {
      var x2 = (k / N2) * SW;
      var y2 = ribbonY(r, x2, SW, SH, HY, t, grow);
      if (k === 0) g.moveTo(x2, y2); else g.lineTo(x2, y2);
    }
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = rgba(col, A * 0.22);
    g.lineWidth = Math.max(3.0, r.th * SH * 0.045);
    g.stroke();
    g.strokeStyle = rgba(col, A * 0.90);
    g.lineWidth = 1.15;
    g.stroke();

    /* 4) 折痕高光：褶皱收紧的地方更亮，像绸子折起来的那一道 */
    var gs = glowSprite(col);
    if (gs) {
      for (var q = 0; q < 3; q++) {
        var uq = 0.22 + q * 0.29 + Math.sin(t * 0.09 + ph + q) * 0.03;
        var xq = uq * SW;
        var yq = ribbonY(r, xq, SW, SH, HY, t, grow);
        var rq = Math.max(12, r.th * SH * 0.55);
        g.globalAlpha = Math.min(0.42, A * 0.9);
        g.drawImage(gs, xq - rq, yq - rq, rq * 2, rq * 2);
      }
      g.globalAlpha = 1;
    }
  }

  /* ---------- 冰湖倒影：把天上那几道同步压到湖面上 ---------- */
  function drawReflection(g, SW, SH, HY, t, k) {
    g.save();
    lakeTopPath(g, SW, SH);
    g.lineTo(SW, SH);
    g.lineTo(0, SH);
    g.closePath();
    g.clip();
    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < RIBBONS.length; i++) {
      var r = RIBBONS[i];
      var grow = sstep(r.at, r.at + 0.25, k.p);
      if (grow <= 0.02) continue;
      var A = r.a * k.strength * grow;
      var base = lakeTopAt(SW * 0.5, SW, SH) + SH * 0.026 + i * SH * 0.004;
      g.beginPath();
      for (var n = 0; n <= 32; n++) {
        var x = (n / 32) * SW;
        var ys = ribbonY(r, x, SW, SH, HY, t, grow);
        var ry = base + (ys - HY * 0.26) * (0.50 + i * 0.03);
        ry += Math.sin(x / (SW * 0.052) + t * 0.85 + i) * SH * 0.0045;
        if (n === 0) g.moveTo(x, ry); else g.lineTo(x, ry);
      }
      g.strokeStyle = rgba(r.col, A * 0.40);
      g.lineWidth = SH * 0.011;
      g.lineJoin = 'round';
      g.stroke();
      g.strokeStyle = rgba(r.col, A * 0.30);
      g.lineWidth = SH * 0.0032;
      g.stroke();
    }
    /* 冰面的碎光：跟着时间闪，不是粒子系统 */
    for (var s = 0; s < 30; s++) {
      var sx = (s / 30) * SW + Math.sin(s * 7.3) * SW * 0.02;
      var sy = lakeTopAt(sx, SW, SH) + SH * 0.02 + Math.abs(Math.sin(s * 3.7)) * SH * 0.15;
      var tw = 0.5 + 0.5 * Math.sin(t * 1.6 + s * 2.1);
      g.fillStyle = 'rgba(198,246,255,' + (0.04 + 0.16 * tw * k.strength).toFixed(3) + ')';
      g.fillRect(sx, sy, 2 + tw * 3, 1);
    }
    g.restore();
  }

  /* ---------- 极光盒 ---------- */
  function drawBox(g, x, y, unit, open, t, p) {
    var u = unit;
    g.save();
    g.translate(x, y);
    /* v5.2 第一幕：盒子是从手里放下去的 —— 开头比落点高一点，缓慢沉下来。
       （旧版一上来就贴地，少了"拿出来"这个动作。） */
    var lift = (1 - sstep(0.03, 0.20, p == null ? 1 : p)) * u * 3.0;
    /* 浮起来一点点 */
    var bob = Math.sin(t * 1.1) * u * 0.45;
    g.translate(0, -u * 0.6 + bob - lift);

    /* 冰面上的光池 */
    g.save();
    g.globalCompositeOperation = 'lighter';
    var pool = glowSprite([130, 255, 232]);
    if (pool) {
      g.globalAlpha = 0.16 + open * 0.26;
      g.drawImage(pool, -u * 7, u * 1.4 - u * 7, u * 14, u * 14);
      g.globalAlpha = 1;
    }
    g.restore();

    /* 箱体（像素硬边，不用圆角） */
    g.fillStyle = '#4a3423';
    g.fillRect(-u * 4.2, -u * 2.4, u * 8.4, u * 4.4);
    g.fillStyle = '#5d4229';
    g.fillRect(-u * 3.6, -u * 2.0, u * 7.2, u * 3.4);
    g.fillStyle = '#8a6234';
    g.fillRect(-u * 4.2, -u * 0.4, u * 8.4, u * 0.7);
    /* 铜包角 */
    g.fillStyle = '#b98b4e';
    g.fillRect(-u * 4.2, -u * 2.4, u * 0.7, u * 4.4);
    g.fillRect(u * 3.5, -u * 2.4, u * 0.7, u * 4.4);
    /* 正面符文 */
    g.fillStyle = 'rgba(150,255,226,' + (0.35 + 0.35 * Math.sin(t * 2.4)).toFixed(3) + ')';
    g.fillRect(-u * 1.4, -u * 1.1, u * 0.8, u * 0.25);
    g.fillRect(-u * 0.3, -u * 1.1, u * 0.8, u * 0.25);
    g.fillRect(u * 0.8, -u * 1.1, u * 0.8, u * 0.25);

    /* 盖子：绕后侧铰链掀开 */
    var ang = open * 1.15;
    g.save();
    g.translate(0, -u * 2.4);
    g.rotate(-ang);
    g.fillStyle = '#6a4b2e';
    g.fillRect(-u * 4.6, -u * 1.2, u * 9.2, u * 1.4);
    g.fillStyle = '#8a6234';
    g.fillRect(-u * 4.6, -u * 1.2, u * 9.2, u * 0.35);
    /* 盖子内侧被内部光照亮 */
    if (open > 0.05) {
      g.fillStyle = 'rgba(190,255,238,' + (0.55 * open).toFixed(3) + ')';
      g.fillRect(-u * 4.2, -u * 0.95, u * 8.4, u * 1.0);
    }
    g.restore();

    /* 箱口内部的光 */
    if (open > 0.02) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      var ig = g.createRadialGradient(0, -u * 2.2, 0, 0, -u * 2.2, u * 5.2 * open);
      ig.addColorStop(0, 'rgba(235,255,250,' + (0.85 * open).toFixed(3) + ')');
      ig.addColorStop(0.35, 'rgba(140,255,236,' + (0.42 * open).toFixed(3) + ')');
      ig.addColorStop(1, 'rgba(90,210,255,0)');
      g.fillStyle = ig;
      g.fillRect(-u * 6, -u * 8, u * 12, u * 12);
      g.restore();
    }
    g.restore();
  }

  /* ---------- 主绘制 ----------
     p: 0~1 演出进度（线性，game.js 直接给 t/dur）
     时间轴：
       0.00~0.18 前奏：只有盒子亮着，世界还是暗的
       0.16~0.32 盒盖打开、光柱升起、冰面开始反光
       0.30~0.56 第一道极光从山后升起，慢慢铺开
       0.44~0.72 蓝、紫加入，光带互相穿插
       0.62~0.86 高潮：满天空、山脊轮廓光、人物轮廓光
       0.86~1.00 定格：镜头拉远，留够截图时间
  */
  function drawAurora(ctx, w, h, t, p, zoom) {
    p = clamp01(p == null ? 0 : p);
    var SW = Math.max(320, w) * SCENE_SCALE;
    var SH = Math.max(320, h) * SCENE_SCALE;
    var bg = bakeScene(SW, SH, 'bg');
    var land = bakeLand(SW, SH, SH * 0.665);
    var fore = bakeFore(SW, SH);
    var HY = SH * 0.665;

    /* ---- 镜头：从近到远，最后停住；同时极缓慢地横移一点点 ---- */
    var z = 1.13 - 0.25 * sstep(0.05, 0.92, p);
    if (typeof zoom === 'number' && zoom > 0) z *= zoom;
    var driftX = Math.sin(p * 2.2) * SW * 0.008;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#01030a';
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w / 2, h * 0.665);
    ctx.scale(z, z);
    ctx.translate(-SW / 2 + driftX, -SH * 0.665);

    /* ---- 阶段强度 ---- */
    var skyA = 0.10 + 0.90 * sstep(0.02, 0.46, p);
    var landA = 0.20 + 0.80 * sstep(0.03, 0.50, p);
    var open = sstep(0.155, 0.30, p);                        // 盒盖
    var beam = sstep(0.15, 0.30, p) * (1 - sstep(0.56, 0.76, p) * 0.92);
    var strength = sstep(0.28, 0.70, p);                     // 极光总强度
    var kk = { p: p, strength: strength };

    /* ---- 夜空 ---- */
    if (bg) {
      ctx.globalAlpha = skyA;
      ctx.drawImage(bg.cv, 0, 0, SW, SH);
      ctx.globalAlpha = 1;
    }

    /* ---- 极光（画在山之前，才会被山咬住下缘） ---- */
    if (strength > 0.004) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      /* 天顶的冷光：整片天空被点亮，不是某一处 */
      var glow = ctx.createLinearGradient(0, HY - SH * 0.50, 0, HY + SH * 0.02);
      glow.addColorStop(0, 'rgba(70,210,190,' + (0.02 * strength).toFixed(3) + ')');
      glow.addColorStop(0.45, 'rgba(96,240,206,' + (0.055 * strength).toFixed(3) + ')');
      glow.addColorStop(0.78, 'rgba(110,255,220,' + (0.09 * strength).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(110,255,220,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, HY - SH * 0.50, SW, SH * 0.54);

      for (var i = 0; i < RIBBONS.length; i++) {
        var r = RIBBONS[i];
        var grow = sstep(r.at, r.at + 0.26, p);
        if (grow <= 0.01) continue;
        /* 整体呼吸感：不是三条一起闪，而是各自慢一档 */
        var breathe = 0.82 + 0.18 * Math.sin(t * 0.42 + r.ph * 1.35);
        drawRibbon(ctx, r, SW, SH, HY, t, grow, r.a * strength * breathe, false);
      }
      ctx.restore();
    }

    /* ---- 山与冰湖（不透明，压住极光下缘） ---- */
    if (land) {
      ctx.globalAlpha = landA;
      ctx.drawImage(land.cv, 0, 0, SW, SH);
      ctx.globalAlpha = 1;
      /* 山脊轮廓光：极光越强，山脊那条线越亮 */
      if (strength > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ridgeLine(ctx, land.far, SW);
        ctx.strokeStyle = 'rgba(120,240,208,' + (0.10 * strength).toFixed(3) + ')';
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(190,255,236,' + (0.14 * strength).toFixed(3) + ')';
        ctx.lineWidth = 1.0;
        ctx.stroke();
        ridgeLine(ctx, land.mid, SW);
        ctx.strokeStyle = 'rgba(160,255,224,' + (0.10 * strength).toFixed(3) + ')';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        /* 雪原被极光洗过的一层薄绿 */
        var washY = lakeTopAt(SW * 0.5, SW, SH);
        var wash = ctx.createLinearGradient(0, HY, 0, washY);
        wash.addColorStop(0, 'rgba(90,235,196,' + (0.11 * strength).toFixed(3) + ')');
        wash.addColorStop(1, 'rgba(90,235,196,0)');
        ctx.fillStyle = wash;
        ctx.fillRect(0, HY, SW, washY - HY);
        ctx.restore();
      }
    }

    /* ---- 冰湖倒影 ---- */
    if (strength > 0.03) drawReflection(ctx, SW, SH, HY, t, kk);

    /* ---- v5.2 雪尘：被极光照亮的细小雪粒，横着飘。
       纯按时间算，不建粒子数组；只在极光起来之后出现，数量很少。 ---- */
    if (strength > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var sn = 0; sn < 26; sn++) {
        var u0 = ((sn * 0.618 + t * 0.0075) % 1);
        var sx0 = u0 * SW;
        var sy0 = SH * 0.55 + ((sn * 137.5 + t * 5.2) % (SH * 0.36));
        var aa0 = (0.05 + 0.10 * Math.abs(Math.sin(sn * 1.7 + t * 0.9))) * strength;
        ctx.fillStyle = 'rgba(206,246,255,' + aa0.toFixed(3) + ')';
        ctx.fillRect(sx0, sy0, 1.6, 1.2);
      }
      ctx.restore();
    }

    /* ---- 前置暗压：前奏阶段画面整体是暗的 ---- */
    var darkA = 0.55 * (1 - sstep(0.06, 0.52, p));
    if (darkA > 0.005) {
      ctx.fillStyle = 'rgba(3,7,16,' + darkA.toFixed(3) + ')';
      ctx.fillRect(0, 0, SW, SH);
    }

    /* ---- 极光盒 + 光柱 ---- */
    var figY = SH * 0.862;
    var figH = Math.min(SH * 0.170, 214);
    var unit = Math.max(2.2, figH * 0.038);   // 盒子别做大：做大了像一张桌子
    var boxX = SW * 0.5, boxY = figY + figH * 0.02;

    if (beam > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      /* 光柱：横向用渐变收边（一条硬边矩形在屏幕上就是"探照灯"），
         纵向用 22 片切片叠出"越往上越淡"的衰减，上端一直伸进极光带。 */
      var topY = HY - SH * 0.34;
      var bH = boxY - topY;
      var coreW = Math.max(2.2, unit * 0.52);
      var haloW = Math.max(9, unit * 3.0);
      var hg = ctx.createLinearGradient(boxX - haloW, 0, boxX + haloW, 0);
      hg.addColorStop(0, 'rgba(150,248,230,0)');
      hg.addColorStop(0.40, 'rgba(150,248,230,1)');
      hg.addColorStop(0.60, 'rgba(150,248,230,1)');
      hg.addColorStop(1, 'rgba(150,248,230,0)');
      var cg = ctx.createLinearGradient(boxX - coreW, 0, boxX + coreW, 0);
      cg.addColorStop(0, 'rgba(226,255,250,0)');
      cg.addColorStop(0.5, 'rgba(226,255,250,1)');
      cg.addColorStop(1, 'rgba(226,255,250,0)');
      var SL = 22, sh = bH / SL + 1;
      for (var si = 0; si < SL; si++) {
        var yy = topY + (bH * si) / SL;
        var vf = Math.pow((si + 1) / SL, 1.7);
        ctx.globalAlpha = 0.26 * beam * vf;
        ctx.fillStyle = hg;
        ctx.fillRect(boxX - haloW, yy, haloW * 2, sh);
        ctx.globalAlpha = 0.50 * beam * vf;
        ctx.fillStyle = cg;
        ctx.fillRect(boxX - coreW, yy, coreW * 2, sh);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* ---- 两个小人 ---- */
    var gap = SW * 0.052;
    drawFigure(ctx, 'a', boxX - gap, figY, figH, t, strength, open);
    drawFigure(ctx, 'b', boxX + gap, figY, figH, t, strength, open);

    /* ---- 盒子（画在人之后，才不会被人挡住） ---- */
    drawBox(ctx, boxX, boxY, unit, open, t, p);

    /* ---- v5.2 前景冰崖：画在人物之后才是真的"前景" ----
       它只压住画面最底一条，人物站在它后面，纵深感就出来了。 ---- */
    if (fore) {
      ctx.globalAlpha = 0.94;
      ctx.drawImage(fore.cv, 0, 0, SW, SH);
      ctx.globalAlpha = 1;
    }

    /* ---- 暗角 ----
       v5.2：不再烘一张全屏位图（四张大图在手机上太吃内存），
       改成每帧一个径向渐变 —— 一次 fill，开销可以忽略。 */
    var vgr = ctx.createRadialGradient(SW / 2, SH * 0.60, Math.min(SW, SH) * 0.30,
      SW / 2, SH * 0.60, Math.max(SW, SH) * 0.80);
    vgr.addColorStop(0, 'rgba(0,0,0,0)');
    vgr.addColorStop(0.62, 'rgba(2,6,14,.20)');
    vgr.addColorStop(1, 'rgba(2,5,12,.72)');
    ctx.fillStyle = vgr;
    ctx.fillRect(0, 0, SW, SH);

    ctx.restore();
  }

  function drawFigure(ctx, which, x, y, figH, t, strength, open) {
    var fig = bakeFigure(which, figH);
    var w = fig ? fig.w : figH * 0.567;
    var h = figH;
    var sway = Math.sin(t * 0.9 + (which === 'a' ? 0 : 1.7)) * figH * 0.004;

    /* 脚下投影 */
    ctx.save();
    ctx.fillStyle = 'rgba(4,10,18,.42)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, w * 0.46, figH * 0.035, 0, 0, 7);
    ctx.fill();
    ctx.restore();

    if (!fig) return;
    var top = y - h * 0.984 + sway;
    /* 轮廓光：极光从上方打下来（更亮）+ 盒子从下方打上来（前奏时唯一的光） */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    /* 轮廓光要"薄"：偏上、半透明，太实会像贴纸描边 */
    var rimA = 0.10 + 0.26 * strength;
    ctx.globalAlpha = rimA;
    ctx.drawImage(fig.rim, x - w / 2 - w * 0.022, top - h * 0.016, w, h);
    ctx.globalAlpha = rimA * 0.45;
    ctx.drawImage(fig.rim, x - w / 2 + w * 0.020, top - h * 0.008, w, h);
    ctx.restore();

    /* 盒子下方的暖冷光（前奏阶段为主） */
    if (open > 0.02) {
      var ug = glowSprite([150, 255, 238]);
      if (ug) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.16 * open;
        ctx.drawImage(ug, x - figH * 0.8, y - figH * 0.8, figH * 1.6, figH * 1.6);
        ctx.restore();
      }
    }

    ctx.drawImage(fig.body, x - w / 2, top, w, h);
  }

  /* ============================================================
   * 3. 小镇：天亮
   * ------------------------------------------------------------
   * p: 0~1；0 = 还是极夜，1 = 阳光完全回来
   * ============================================================ */
  function drawSunrise(ctx, w, h, t, p) {
    var k = Math.max(0, Math.min(1, p));
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    /* 天空：从深蓝一路推到暖金 */
    var sky = ctx.createLinearGradient(0, 0, 0, h * 0.72);
    sky.addColorStop(0, lerpHex('#050a18', '#7fb7e8', k));
    sky.addColorStop(0.45, lerpHex('#0a1830', '#ffd9a0', k));
    sky.addColorStop(0.72, lerpHex('#102542', '#fff0cf', k));
    sky.addColorStop(1, lerpHex('#17324f', '#ffe6b8', k));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.74);

    /* 太阳：从地平线慢慢升起来 */
    var sunY = h * (0.74 - 0.16 * k);
    var sr = h * 0.075;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var sg = ctx.createRadialGradient(w * 0.5, sunY, 0, w * 0.5, sunY, sr * 5);
    sg.addColorStop(0, 'rgba(255,244,214,' + (0.9 * k).toFixed(3) + ')');
    sg.addColorStop(0.22, 'rgba(255,214,150,' + (0.5 * k).toFixed(3) + ')');
    sg.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(w * 0.5, sunY, sr, 0, 7);
    ctx.fillStyle = 'rgba(255,250,236,' + k.toFixed(3) + ')';
    ctx.fill();
    ctx.restore();

    /* 雪地：从冷灰推到暖白 */
    var snow = ctx.createLinearGradient(0, h * 0.70, 0, h);
    snow.addColorStop(0, lerpHex('#101f30', '#e8f0fa', k));
    snow.addColorStop(1, lerpHex('#1a2c40', '#fffdf8', k));
    ctx.fillStyle = snow;
    ctx.fillRect(0, h * 0.70, w, h * 0.30);

    /* 地平线上的房子剪影：窗子的灯一点点亮起来 */
    var seed = 77;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    for (var i = 0; i < 7; i++) {
      var bw = w * (0.07 + rnd() * 0.05);
      var bh = h * (0.05 + rnd() * 0.05);
      var bx = w * (0.06 + i * 0.135) + rnd() * 10;
      var by = h * 0.74;
      ctx.fillStyle = lerpHex('#0b1522', '#6b5a48', k);
      ctx.fillRect(bx, by - bh, bw, bh);
      ctx.beginPath();
      ctx.moveTo(bx - 3, by - bh);
      ctx.lineTo(bx + bw / 2, by - bh - bh * 0.45);
      ctx.lineTo(bx + bw + 3, by - bh);
      ctx.closePath();
      ctx.fill();
      var wl = Math.max(0, Math.min(1, k * 1.4 - 0.25));
      if (wl > 0.02) {
        ctx.fillStyle = 'rgba(255,214,140,' + wl.toFixed(3) + ')';
        ctx.fillRect(bx + bw * 0.28, by - bh * 0.62, bw * 0.18, bh * 0.22);
        ctx.fillRect(bx + bw * 0.62, by - bh * 0.62, bw * 0.18, bh * 0.22);
      }
    }

    /* 一棵小树（镇上那棵）：灯一点点亮回来 */
    var tx = w * 0.82, ty = h * 0.755;
    ctx.fillStyle = lerpHex('#0d1b2a', '#1d4a35', k);
    for (var tier = 0; tier < 3; tier++) {
      var tw = w * (0.085 - tier * 0.018);
      var tyy = ty - tier * h * 0.035;
      ctx.beginPath();
      ctx.moveTo(tx, tyy - h * 0.07);
      ctx.lineTo(tx + tw, tyy);
      ctx.lineTo(tx - tw, tyy);
      ctx.closePath();
      ctx.fill();
    }
    if (k > 0.5) {
      var lk = (k - 0.5) / 0.5;
      for (var s2 = 0; s2 < 16; s2++) {
        var ax = tx + Math.sin(s2 * 2.3) * w * 0.06;
        var ay = ty - (s2 % 5) * h * 0.022 - h * 0.01;
        ctx.fillStyle = 'rgba(255,214,130,' + (lk * (0.5 + 0.5 * Math.sin(t * 2 + s2))).toFixed(3) + ')';
        ctx.fillRect(ax, ay, 2, 2);
      }
    }

    /* 雪地反射的暖光 */
    if (k > 0.15) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var rg = ctx.createRadialGradient(w * 0.5, h * 0.90, 0, w * 0.5, h * 0.90, w * 0.7);
      rg.addColorStop(0, 'rgba(255,226,170,' + (0.20 * k).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,210,150,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, h * 0.7, w, h * 0.3);
      ctx.restore();
    }
    ctx.restore();
  }

  /* 十六进制颜色插值 */
  function lerpHex(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    var ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    var br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    var r = Math.round(ar + (br - ar) * t);
    var g = Math.round(ag + (bg - ag) * t);
    var bl = Math.round(ab + (bb - ab) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  return {
    /* 剧情 */
    ctxOf: ctxOf,
    baseReady: baseReady,
    storyReady: storyReady,
    stageOf: stageOf,
    polarOf: polarOf,
    hintStageOf: hintStageOf,
    hintTalked: hintTalked,
    NORTH_TALK_NEED: NORTH_TALK_NEED,
    tierOf: tierOf,
    TIER: TIER,
    talkStageOf: talkStageOf,
    npcTalk: npcTalk,
    npcLines: npcLines,
    lines: TALK,
    letter: LETTER,
    polarLines: POLAR_LINES,
    /* 演出 */
    AURORA_SECONDS: AURORA_SECONDS,
    drawAurora: drawAurora,
    drawSunrise: drawSunrise,
    /* 给测试/调试用：把烘出来的位图作废（改尺寸后重新烘） */
    clearCache: function () { CACHE = {}; CACHE_ORDER = []; }
  };
})();
